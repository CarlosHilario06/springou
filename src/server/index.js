import express from "express";
import cors from "cors";
import cron from "node-cron";

import { env } from "./env.js";
import prisma from "./prisma.js";
import { ensureAdminUser } from "./auth/bootstrap.js";
import { requireAuth } from "./auth/middleware.js";
import { HttpError } from "./lib/http.js";
import { syncGamConnections } from "./services/gamSync.js";

import authRoutes from "./routes/auth.routes.js";
import projectsRoutes from "./routes/projects.routes.js";
import splittersRoutes from "./routes/splitters.routes.js";
import linksRoutes from "./routes/links.routes.js";
import splitterRoutesRoutes from "./routes/splitterRoutes.routes.js";
import gamRoutes from "./routes/gam.routes.js";
import redirectRoutes from "./routes/redirect.routes.js";

const app = express();

// Atrás do proxy do Railway/Nginx: sem isso o Host do redirect vem errado.
app.set("trust proxy", true);
app.disable("x-powered-by");

app.use(
  cors({
    origin(origin, callback) {
      // Sem Origin = chamada servidor-a-servidor ou navegação direta.
      if (!origin || env.corsOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origem não permitida pelo CORS: ${origin}`));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "1mb" }));

/* ------------------------------------------------------------- públicas */

app.get("/api/health", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      ok: true,
      database: "connected",
      time: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Health check falhou:", error);
    res.status(503).json({ ok: false, database: "disconnected" });
  }
});

app.use("/api/auth", authRoutes);

// O redirect é a parte pública do produto: nunca exige autenticação.
app.use(redirectRoutes);

/* ---------------------------------------------------- protegidas por JWT */

app.use("/api", requireAuth);

app.use("/api/projects", projectsRoutes);
app.use("/api", splittersRoutes);
app.use("/api", linksRoutes);
app.use("/api", splitterRoutesRoutes);
app.use("/api/gam", gamRoutes);

/* ------------------------------------------------------------- erros */

app.use((req, res) => {
  res.status(404).json({ error: "Endpoint não encontrado" });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);

  if (error instanceof HttpError) {
    return res.status(error.status).json({ error: error.message });
  }

  // Violação de unicidade do Prisma vira 409 em vez de 500.
  if (error?.code === "P2002") {
    return res.status(409).json({ error: "Registro duplicado" });
  }

  console.error("❌ Erro não tratado:", error);

  return res.status(500).json({
    error: env.isProduction ? "Erro interno" : error.message,
  });
});

/* ------------------------------------------------------------- start */

async function start() {
  await prisma.$connect();
  await ensureAdminUser();

  if (env.gam.syncEnabled) {
    if (!cron.validate(env.gam.syncCron)) {
      console.error(`❌ GAM_SYNC_CRON inválido: ${env.gam.syncCron}`);
    } else {
      cron.schedule(env.gam.syncCron, () => {
        syncGamConnections().catch(() => {
          /* já logado e registrado em gamSyncState */
        });
      });
      console.log(`🟢 Sync automático do GAM ativo (${env.gam.syncCron})`);
    }
  } else {
    console.log("⚪ Sync automático do GAM desativado (ENABLE_GAM_SYNC=false)");
  }

  app.listen(env.port, () => {
    console.log(`🚀 API em http://localhost:${env.port}`);
  });
}

start().catch(async (error) => {
  console.error("❌ Falha ao iniciar o servidor:", error);
  await prisma.$disconnect();
  process.exit(1);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}
