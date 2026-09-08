import { Router } from "express";
import prisma from "../prisma.js";
import { env } from "../env.js";
import { pickByProbability } from "../../shared/probability.js";
import { renderRedirectLoader } from "../views/redirectLoader.js";
import { normalizeDomain, normalizeSlug } from "../lib/http.js";

const router = Router();

/** Anexa as UTMs do link na URL de destino, sobrescrevendo as existentes. */
export function buildUrlWithUtms(baseUrl, utms) {
  try {
    const url = new URL(baseUrl);

    let parsed = utms;
    if (typeof parsed === "string") parsed = JSON.parse(parsed || "{}");
    if (!parsed || typeof parsed !== "object") return url.toString();

    for (const [key, value] of Object.entries(parsed)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }

    return url.toString();
  } catch (error) {
    console.error("Erro ao montar URL com UTMs:", error);
    return baseUrl;
  }
}

router.get("/go/:slug", async (req, res, next) => {
  try {
    const slug = normalizeSlug(req.params.slug);
    const domain = normalizeDomain(req.get("host") || req.hostname);

    if (!slug) return res.status(404).type("text/plain").send("Rota não encontrada");

    // Primeiro a rota exata do domínio; o fallback por slug mantém o link
    // funcionando quando o domínio muda (staging, preview, IP direto).
    let route = await prisma.splitterRoute.findUnique({
      where: { domain_slug: { domain, slug } },
    });

    if (!route) {
      route = await prisma.splitterRoute.findFirst({
        where: { slug },
        orderBy: { createdAt: "asc" },
      });
    }

    if (!route) {
      return res.status(404).type("text/plain").send("Rota não encontrada");
    }

    const links = await prisma.link.findMany({
      where: {
        splitterId: route.splitterId,
        tab: route.tab,
        disabled: false,
      },
    });

    if (links.length === 0) {
      return res
        .status(503)
        .type("text/plain")
        .send("Nenhum link ativo para esta rota");
    }

    const selected = pickByProbability(links) || links[0];
    const finalUrl = buildUrlWithUtms(selected.url, selected.utms);

    // A contagem não deve derrubar o redirect: falhou, segue mesmo assim.
    prisma.link
      .update({ where: { id: selected.id }, data: { visits: { increment: 1 } } })
      .catch((error) => console.error("Falha ao contar visita:", error));

    res.set("Cache-Control", "no-store, no-cache, must-revalidate");

    return res.send(
      renderRedirectLoader({
        url: finalUrl,
        pixelId: route.pixelId || env.defaultPixelId,
        loaderTitle: route.loaderTitle,
        loaderSubtitle: route.loaderSubtitle,
      })
    );
  } catch (error) {
    return next(error);
  }
});

export default router;
