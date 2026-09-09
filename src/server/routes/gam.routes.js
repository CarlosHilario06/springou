import { Router } from "express";
import prisma from "../prisma.js";
import {
  gamAuthMode,
  gamServiceAccountEmail,
  isGamConfigured,
} from "../gam/client.js";
import { gamSyncState, syncGamConnections } from "../services/gamSync.js";
import { listGamReports } from "../gam/listGamReports.js";
import { createGamReport } from "../gam/createGamReport.js";
import { describeGoogleError } from "../gam/errors.js";
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

router.get("/status", async (req, res, next) => {
  try {
    // Depois de reiniciar o servidor a memória zera, mas cada conexão
    // guarda o horário do próprio último sync: o painel continua sabendo
    // quando os números foram atualizados.
    const ultima = await prisma.gamConnection.findFirst({
      where: { lastSyncAt: { not: null } },
      orderBy: { lastSyncAt: "desc" },
      select: { lastSyncAt: true },
    });

    res.json({
      configured: isGamConfigured(),
      authMode: gamAuthMode(),
      serviceAccountEmail: gamServiceAccountEmail(),
      autoSyncEnabled: env.gam.syncEnabled,
      cron: env.gam.syncCron,
      running: gamSyncState.running,
      lastSyncAt: gamSyncState.lastSyncAt ?? ultima?.lastSyncAt ?? null,
      lastError: gamSyncState.lastError,
    });
  } catch (error) {
    next(error);
  }
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

/**
 * Relatórios que a credencial enxerga numa rede.
 *
 * Relatório salvo tem dono no GAM, então o ID que o operador vê no painel
 * dele nem sempre é visível para a conta de serviço. Listar evita cadastrar
 * um ID que nunca vai funcionar.
 */
router.get("/networks/:networkCode/reports", async (req, res, next) => {
  try {
    if (!isGamConfigured()) {
      throw badRequest("GAM não configurado — defina as credenciais no .env");
    }

    const networkCode = requireString(req.params.networkCode, "Network code", {
      maxLength: 40,
    });

    res.json(await listGamReports({ networkCode }));
  } catch (error) {
    if (error?.response) {
      return next(badRequest(describeGoogleError(error)));
    }

    next(error);
  }
});

/**
 * Cria na rede o relatório que o sincronizador sabe ler.
 *
 * Feito pela API, ele pertence à conta de serviço — e é isso que evita o
 * beco sem saída de um relatório salvo pela interface, que fica privado de
 * quem o criou e some para a API.
 */
router.post("/networks/:networkCode/reports", async (req, res, next) => {
  try {
    if (!isGamConfigured()) {
      throw badRequest("GAM não configurado — defina as credenciais no .env");
    }

    const networkCode = requireString(req.params.networkCode, "Network code", {
      maxLength: 40,
    });

    const reportKey =
      optionalString(req.body?.reportType, { maxLength: 40 }) || "utm_campaign";

    if (!REPORT_TYPES.includes(reportKey)) {
      throw badRequest(`reportType deve ser um de: ${REPORT_TYPES.join(", ")}`);
    }

    res.status(201).json(await createGamReport({ networkCode, reportKey }));
  } catch (error) {
    if (error?.response) {
      return next(badRequest(describeGoogleError(error)));
    }

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
