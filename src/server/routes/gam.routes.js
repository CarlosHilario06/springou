import { Router } from "express";
import prisma from "../prisma.js";
import { isGamConfigured } from "../gam/client.js";
import { gamSyncState, syncGamConnections } from "../services/gamSync.js";
import { env } from "../env.js";
import {
  badRequest,
  notFound,
  optionalString,
  parseId,
  requireString,
} from "../lib/http.js";

const router = Router();

const REPORT_TYPES = ["utm_campaign", "utm_source", "utm_medium", "utm_content"];

router.get("/status", (req, res) => {
  res.json({
    configured: isGamConfigured(),
    autoSyncEnabled: env.gam.syncEnabled,
    cron: env.gam.syncCron,
    running: gamSyncState.running,
    lastSyncAt: gamSyncState.lastSyncAt,
    lastError: gamSyncState.lastError,
  });
});

router.get("/connections", async (req, res, next) => {
  try {
    res.json(
      await prisma.gamConnection.findMany({ orderBy: { createdAt: "desc" } })
    );
  } catch (error) {
    next(error);
  }
});

router.post("/connections", async (req, res, next) => {
  try {
    const reportType =
      optionalString(req.body?.reportType, { maxLength: 40 }) || "utm_campaign";

    if (!REPORT_TYPES.includes(reportType)) {
      throw badRequest(`reportType deve ser um de: ${REPORT_TYPES.join(", ")}`);
    }

    res.status(201).json(
      await prisma.gamConnection.create({
        data: {
          name: requireString(req.body?.name, "Nome da conexão", {
            maxLength: 120,
          }),
          networkCode: requireString(req.body?.networkCode, "Network code", {
            maxLength: 40,
          }),
          reportId: optionalString(req.body?.reportId, { maxLength: 40 }),
          reportType,
          active: req.body?.active === undefined ? true : Boolean(req.body.active),
          status: "pending",
        },
      })
    );
  } catch (error) {
    next(error);
  }
});

router.put("/connections/:id", async (req, res, next) => {
  try {
    const id = parseId(req.params.id, "Conexão");

    const existing = await prisma.gamConnection.findUnique({ where: { id } });
    if (!existing) throw notFound("Conexão não encontrada");

    const data = {};

    if (req.body?.name !== undefined) {
      data.name = requireString(req.body.name, "Nome da conexão", {
        maxLength: 120,
      });
    }

    if (req.body?.networkCode !== undefined) {
      data.networkCode = requireString(req.body.networkCode, "Network code", {
        maxLength: 40,
      });
    }

    if (req.body?.reportId !== undefined) {
      data.reportId = optionalString(req.body.reportId, { maxLength: 40 });
    }

    if (req.body?.reportType !== undefined) {
      const reportType = String(req.body.reportType);
      if (!REPORT_TYPES.includes(reportType)) {
        throw badRequest(`reportType deve ser um de: ${REPORT_TYPES.join(", ")}`);
      }
      data.reportType = reportType;
    }

    if (req.body?.active !== undefined) data.active = Boolean(req.body.active);

    res.json(await prisma.gamConnection.update({ where: { id }, data }));
  } catch (error) {
    next(error);
  }
});

router.delete("/connections/:id", async (req, res, next) => {
  try {
    const id = parseId(req.params.id, "Conexão");

    const existing = await prisma.gamConnection.findUnique({ where: { id } });
    if (!existing) throw notFound("Conexão não encontrada");

    await prisma.gamConnection.delete({ where: { id } });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

/** Sincroniza todas as conexões ativas, ou uma específica via :id. */
async function handleSync(req, res, next) {
  try {
    if (!isGamConfigured()) {
      throw badRequest(
        "GAM não configurado — defina GAM_OAUTH_JSON e GAM_TOKEN_JSON no .env"
      );
    }

    const connectionId = req.params.id
      ? parseId(req.params.id, "Conexão")
      : undefined;

    res.json(await syncGamConnections({ connectionId }));
  } catch (error) {
    next(error);
  }
}

// Express 5 não aceita mais parâmetro opcional (:id?) numa rota só.
router.post("/sync", handleSync);
router.post("/sync/:id", handleSync);

export default router;
