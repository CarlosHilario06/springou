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
    const entry = String(value[key] ?? "").trim();
    if (entry) utms[key] = entry.slice(0, 255);
  }

  return Object.keys(utms).length > 0 ? utms : null;
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

    const link = await prisma.link.create({
      data: {
        splitterId,
        tab,
        url: requireHttpUrl(req.body?.url, "URL do link"),
        type: optionalString(req.body?.type, { maxLength: 60 }),
        disabled: Boolean(req.body?.disabled),
        utms: parseUtms(req.body?.utms),
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
        confidence: Number(link.confidence.toFixed(3)),
        probability: link.probability,
      }))
    );
  } catch (error) {
    next(error);
  }
});

export default router;
