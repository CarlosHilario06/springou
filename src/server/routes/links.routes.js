import { Router } from "express";
import prisma from "../prisma.js";
import { optimizeTrafficProbabilities } from "../services/optimizer.js";
import { calculateProbabilities } from "../../shared/probability.js";
import {
  badRequest,
  notFound,
  optionalString,
  parseId,
  requireHttpUrl,
} from "../lib/http.js";

const router = Router();

const ALLOWED_UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
];

/** Aceita só as chaves utm_* conhecidas, com valores em texto. */
function parseUtms(raw) {
  if (raw === undefined || raw === null || raw === "") return null;

  let value = raw;

  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      throw badRequest("UTMs em formato inválido");
    }
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    throw badRequest("UTMs devem ser um objeto");
  }

  const utms = {};

  for (const key of ALLOWED_UTM_KEYS) {
    let entry = String(value[key] ?? "").trim();

    // O relatório do Ad Manager mostra a chave-valor inteira
    // ("utm_campaign=4_SPLIT1"), então colar a linha toda no campo é o
    // gesto natural. Aceita, tirando o prefixo repetido.
    const prefix = `${key}=`;
    if (entry.toLowerCase().startsWith(prefix)) {
      entry = entry.slice(prefix.length).trim();
    }

    if (entry) utms[key] = entry.slice(0, 255);
  }

  return Object.keys(utms).length > 0 ? utms : null;
}

/** Trava manual: número de 0 a 100, ou null para deixar automático. */
function parseFixedProbability(raw) {
  if (raw === null || raw === undefined || raw === "") return null;

  const value = Number(raw);

  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw badRequest("O peso fixo deve ser um número entre 0 e 100");
  }

  return Number(value.toFixed(2));
}

/**
 * Lê as UTMs que já vêm na query string da URL de destino.
 *
 * O painel também faz isso ao digitar, mas a lista inline salva a URL crua
 * — e é aqui que ela vira `utm_campaign`, a chave que casa com o relatório
 * do Ad Manager.
 */
function extractUtmsFromUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    const utms = {};

    for (const key of ALLOWED_UTM_KEYS) {
      const value = parsed.searchParams.get(key)?.trim();
      if (value) utms[key] = value.slice(0, 255);
    }

    return Object.keys(utms).length > 0 ? utms : null;
  } catch {
    return null;
  }
}

async function ensureTabExists(splitterId, tab) {
  const existing = await prisma.splitterTab.findUnique({
    where: { splitterId_tab: { splitterId, tab } },
  });

  if (!existing) throw badRequest(`A aba "${tab}" não existe neste splitter`);
}

router.get("/splitters/:splitterId/links", async (req, res, next) => {
  try {
    const splitterId = parseId(req.params.splitterId, "Splitter");
    const tab = optionalString(req.query?.tab, { maxLength: 60 });

    const links = await prisma.link.findMany({
      where: { splitterId, ...(tab ? { tab } : {}) },
      orderBy: [{ tab: "asc" }, { createdAt: "asc" }],
    });

    res.json(links);
  } catch (error) {
    next(error);
  }
});

router.post("/splitters/:splitterId/links", async (req, res, next) => {
  try {
    const splitterId = parseId(req.params.splitterId, "Splitter");

    const splitter = await prisma.splitter.findUnique({
      where: { id: splitterId },
    });
    if (!splitter) throw notFound("Splitter não encontrado");

    const tab = optionalString(req.body?.tab, { maxLength: 60 }) || "1";
    await ensureTabExists(splitterId, tab);

    const url = requireHttpUrl(req.body?.url, "URL do link");

    const link = await prisma.link.create({
      data: {
        splitterId,
        tab,
        url,
        type: optionalString(req.body?.type, { maxLength: 60 }),
        disabled: Boolean(req.body?.disabled),
        utms: parseUtms(req.body?.utms) ?? extractUtmsFromUrl(url),
        fixedProbability: parseFixedProbability(req.body?.fixedProbability),
      },
    });

    // Link novo muda a divisão da aba inteira.
    await optimizeTrafficProbabilities({ splitterId });

    res.status(201).json(
      await prisma.link.findUnique({ where: { id: link.id } })
    );
  } catch (error) {
    next(error);
  }
});

router.put("/links/:id", async (req, res, next) => {
  try {
    const id = parseId(req.params.id, "Link");

    const existing = await prisma.link.findUnique({ where: { id } });
    if (!existing) throw notFound("Link não encontrado");

    const data = {};

    if (req.body?.url !== undefined) {
      data.url = requireHttpUrl(req.body.url, "URL do link");
    }

    if (req.body?.type !== undefined) {
      data.type = optionalString(req.body.type, { maxLength: 60 });
    }

    if (req.body?.disabled !== undefined) {
      data.disabled = Boolean(req.body.disabled);
    }

    if (req.body?.utms !== undefined) {
      data.utms = parseUtms(req.body.utms);
    }

    if (req.body?.tab !== undefined) {
      const tab = optionalString(req.body.tab, { maxLength: 60 }) || "1";
      await ensureTabExists(existing.splitterId, tab);
      data.tab = tab;
    }

    if (req.body?.fixedProbability !== undefined) {
      data.fixedProbability = parseFixedProbability(req.body.fixedProbability);
    }

    await prisma.link.update({ where: { id }, data });
    await optimizeTrafficProbabilities({ splitterId: existing.splitterId });

    res.json(await prisma.link.findUnique({ where: { id } }));
  } catch (error) {
    next(error);
  }
});

router.delete("/links/:id", async (req, res, next) => {
  try {
    const id = parseId(req.params.id, "Link");

    const existing = await prisma.link.findUnique({ where: { id } });
    if (!existing) throw notFound("Link não encontrado");

    await prisma.link.delete({ where: { id } });
    await optimizeTrafficProbabilities({ splitterId: existing.splitterId });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

/**
 * Salva a lista inteira de uma aba de uma vez — o botão "Salvar URLs".
 *
 * Cada item pode trazer `id` (atualiza) ou não (cria). Itens sem URL são
 * descartados em silêncio: são as linhas em branco que o painel adiciona
 * quando se clica em "Adicionar URL" e não se preenche.
 */
router.put("/splitters/:splitterId/links", async (req, res, next) => {
  try {
    const splitterId = parseId(req.params.splitterId, "Splitter");
    const tab = optionalString(req.body?.tab, { maxLength: 60 }) || "1";

    const splitter = await prisma.splitter.findUnique({
      where: { id: splitterId },
    });
    if (!splitter) throw notFound("Splitter não encontrado");

    await ensureTabExists(splitterId, tab);

    if (!Array.isArray(req.body?.links)) {
      throw badRequest("Envie a lista de links em `links`");
    }

    const rows = req.body.links.filter(
      (row) => String(row?.url ?? "").trim() !== ""
    );

    const existing = await prisma.link.findMany({
      where: { splitterId, tab },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((link) => link.id));

    const operations = [];
    const keptIds = new Set();

    for (const row of rows) {
      const data = {
        url: requireHttpUrl(row.url, "URL do link"),
        disabled: Boolean(row.disabled),
        fixedProbability: parseFixedProbability(row.fixedProbability),
      };

      if (row.id !== undefined && row.id !== null) {
        const id = parseId(row.id, "Link");

        // Ignora id de outra aba ou de outro splitter: a lista enviada
        // descreve apenas esta aba.
        if (!existingIds.has(id)) continue;

        keptIds.add(id);
        operations.push(prisma.link.update({ where: { id }, data }));
        continue;
      }

      operations.push(
        prisma.link.create({
          data: {
            ...data,
            splitterId,
            tab,
            utms: parseUtms(row.utms) ?? extractUtmsFromUrl(data.url),
          },
        })
      );
    }

    // O que sumiu da lista foi removido pelo botão "Remover".
    const removedIds = [...existingIds].filter((id) => !keptIds.has(id));

    if (removedIds.length > 0) {
      operations.unshift(
        prisma.link.deleteMany({ where: { id: { in: removedIds } } })
      );
    }

    if (operations.length > 0) await prisma.$transaction(operations);

    await optimizeTrafficProbabilities({ splitterId });

    res.json(
      await prisma.link.findMany({
        where: { splitterId, tab },
        orderBy: { createdAt: "asc" },
      })
    );
  } catch (error) {
    next(error);
  }
});

/** Recalcula a divisão de tráfego sob demanda (o botão "Otimizar"). */
router.post("/splitters/:splitterId/optimize", async (req, res, next) => {
  try {
    const splitterId = parseId(req.params.splitterId, "Splitter");

    const splitter = await prisma.splitter.findUnique({
      where: { id: splitterId },
    });
    if (!splitter) throw notFound("Splitter não encontrado");

    const result = await optimizeTrafficProbabilities({ splitterId });

    res.json({
      ...result,
      links: await prisma.link.findMany({
        where: { splitterId },
        orderBy: [{ tab: "asc" }, { createdAt: "asc" }],
      }),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Prévia da distribuição sem gravar nada — deixa ver o efeito do algoritmo
 * antes de aplicar.
 */
router.get("/splitters/:splitterId/preview", async (req, res, next) => {
  try {
    const splitterId = parseId(req.params.splitterId, "Splitter");
    const tab = optionalString(req.query?.tab, { maxLength: 60 }) || "1";

    const links = await prisma.link.findMany({
      where: { splitterId, tab },
      orderBy: { createdAt: "asc" },
    });

    res.json(
      calculateProbabilities(links).map((link) => ({
        id: link.id,
        url: link.url,
        ecpm: link.ecpm,
        impressions: link.impressions,
        confidence: Number((link.confidence ?? 1).toFixed(3)),
        probability: link.probability,
      }))
    );
  } catch (error) {
    next(error);
  }
});

export default router;
