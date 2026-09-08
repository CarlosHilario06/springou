import { Router } from "express";
import prisma from "../prisma.js";
import {
  badRequest,
  conflict,
  normalizeDomain,
  normalizeSlug,
  notFound,
  optionalString,
  parseId,
  requireString,
} from "../lib/http.js";

const router = Router();

const SLUG_PATTERN = /^[a-z0-9][a-z0-9._~-]*$/;
const DOMAIN_PATTERN = /^[a-z0-9.-]+(:\d{2,5})?$/;

function readDomain(value) {
  const domain = normalizeDomain(requireString(value, "Domínio"));

  if (!domain || !DOMAIN_PATTERN.test(domain)) {
    throw badRequest("Domínio inválido (ex.: meusite.com.br)");
  }

  return domain;
}

function readSlug(value) {
  const slug = normalizeSlug(requireString(value, "Slug"));

  if (!SLUG_PATTERN.test(slug)) {
    throw badRequest("Slug inválido — use letras, números, hífen ou underscore");
  }

  return slug;
}

async function ensureTabExists(splitterId, tab) {
  const existing = await prisma.splitterTab.findUnique({
    where: { splitterId_tab: { splitterId, tab } },
  });

  if (!existing) throw badRequest(`A aba "${tab}" não existe neste splitter`);
}

function readPixelId(value) {
  const pixelId = optionalString(value, { maxLength: 32 });

  if (pixelId && !/^\d{6,20}$/.test(pixelId)) {
    throw badRequest("Pixel ID deve conter apenas números");
  }

  return pixelId;
}

router.get("/splitters/:splitterId/routes", async (req, res, next) => {
  try {
    const splitterId = parseId(req.params.splitterId, "Splitter");

    res.json(
      await prisma.splitterRoute.findMany({
        where: { splitterId },
        orderBy: { createdAt: "desc" },
      })
    );
  } catch (error) {
    next(error);
  }
});

router.post("/splitters/:splitterId/routes", async (req, res, next) => {
  try {
    const splitterId = parseId(req.params.splitterId, "Splitter");

    const splitter = await prisma.splitter.findUnique({
      where: { id: splitterId },
    });
    if (!splitter) throw notFound("Splitter não encontrado");

    const domain = readDomain(req.body?.domain);
    const slug = readSlug(req.body?.slug);
    const tab = optionalString(req.body?.tab, { maxLength: 60 }) || "1";

    await ensureTabExists(splitterId, tab);

    const duplicate = await prisma.splitterRoute.findUnique({
      where: { domain_slug: { domain, slug } },
    });
    if (duplicate) throw conflict(`A rota ${domain}/go/${slug} já existe`);

    res.status(201).json(
      await prisma.splitterRoute.create({
        data: {
          splitterId,
          domain,
          slug,
          tab,
          pixelId: readPixelId(req.body?.pixelId),
          loaderTitle: optionalString(req.body?.loaderTitle, { maxLength: 120 }),
          loaderSubtitle: optionalString(req.body?.loaderSubtitle, {
            maxLength: 200,
          }),
        },
      })
    );
  } catch (error) {
    next(error);
  }
});

router.put("/routes/:id", async (req, res, next) => {
  try {
    const id = parseId(req.params.id, "Rota");

    const existing = await prisma.splitterRoute.findUnique({ where: { id } });
    if (!existing) throw notFound("Rota não encontrada");

    const domain = readDomain(req.body?.domain ?? existing.domain);
    const slug = readSlug(req.body?.slug ?? existing.slug);
    const tab =
      optionalString(req.body?.tab, { maxLength: 60 }) || existing.tab;

    await ensureTabExists(existing.splitterId, tab);

    if (domain !== existing.domain || slug !== existing.slug) {
      const duplicate = await prisma.splitterRoute.findUnique({
        where: { domain_slug: { domain, slug } },
      });
      if (duplicate) throw conflict(`A rota ${domain}/go/${slug} já existe`);
    }

    res.json(
      await prisma.splitterRoute.update({
        where: { id },
        data: {
          domain,
          slug,
          tab,
          pixelId: readPixelId(req.body?.pixelId),
          loaderTitle: optionalString(req.body?.loaderTitle, { maxLength: 120 }),
          loaderSubtitle: optionalString(req.body?.loaderSubtitle, {
            maxLength: 200,
          }),
        },
      })
    );
  } catch (error) {
    next(error);
  }
});

router.delete("/routes/:id", async (req, res, next) => {
  try {
    const id = parseId(req.params.id, "Rota");

    const existing = await prisma.splitterRoute.findUnique({ where: { id } });
    if (!existing) throw notFound("Rota não encontrada");

    await prisma.splitterRoute.delete({ where: { id } });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
