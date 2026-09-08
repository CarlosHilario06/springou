/**
 * Popula o banco com um cenário de teste completo — projeto, splitter,
 * links com métricas realistas e uma rota apontando para localhost.
 *
 * Não roda sozinho em lugar nenhum: só por `npm run seed`. O banco de
 * produção continua nascendo vazio.
 *
 * Rodar de novo apaga e recria apenas o projeto de demonstração; nada
 * mais no banco é tocado.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { calculateProbabilities } from "../src/shared/probability.js";

const prisma = new PrismaClient();

const PROJECT_NAME = "Demo — dados de teste";
const PORT = Number(process.env.PORT || 3001);
const DOMAIN = `localhost:${PORT}`;

// eCPM e impressões escolhidos para mostrar cada comportamento do algoritmo.
const LINKS = [
  {
    url: "https://exemplo.com/oferta-campea",
    type: "advertorial",
    campaign: "demo-campea",
    ecpm: 18.4,
    impressions: 42000,
    nota: "rende bem e tem volume — deve levar a maior fatia",
  },
  {
    url: "https://exemplo.com/oferta-mediana",
    type: "advertorial",
    campaign: "demo-mediana",
    ecpm: 9.1,
    impressions: 38000,
    nota: "metade do eCPM da campeã, mas com volume parecido",
  },
  {
    url: "https://exemplo.com/oferta-fraca",
    type: "quiz",
    campaign: "demo-fraca",
    ecpm: 2.3,
    impressions: 31000,
    nota: "rende pouco mesmo com volume — fica com a menor fatia",
  },
  {
    url: "https://exemplo.com/oferta-nova",
    type: "advertorial",
    campaign: "demo-nova",
    ecpm: 47.9,
    impressions: 120,
    nota: "eCPM altíssimo, mas quase sem dados — segurado pela confiança",
  },
];

async function main() {
  const existing = await prisma.project.findFirst({
    where: { name: PROJECT_NAME },
  });

  if (existing) {
    await prisma.project.delete({ where: { id: existing.id } });
    console.log("♻️  Projeto de demonstração anterior removido.");
  }

  const project = await prisma.project.create({
    data: { name: PROJECT_NAME },
  });

  const splitter = await prisma.splitter.create({
    data: {
      projectId: project.id,
      category: "Emagrecimento",
      location: "Brasil",
      tabs: { create: [{ tab: "1" }] },
    },
  });

  for (const link of LINKS) {
    await prisma.link.create({
      data: {
        splitterId: splitter.id,
        tab: "1",
        url: link.url,
        type: link.type,
        ecpm: link.ecpm,
        impressions: link.impressions,
        revenue: Number(((link.ecpm * link.impressions) / 1000).toFixed(2)),
        utms: {
          utm_campaign: link.campaign,
          utm_source: "facebook",
          utm_medium: "cpc",
        },
      },
    });
  }

  await prisma.splitterRoute.create({
    data: {
      splitterId: splitter.id,
      tab: "1",
      domain: DOMAIN,
      slug: "demo",
      loaderTitle: "Só um instante...",
      loaderSubtitle: "Estamos preparando seu conteúdo.",
    },
  });

  // Mesma distribuição que o botão "Otimizar tráfego" aplica no painel.
  const links = await prisma.link.findMany({
    where: { splitterId: splitter.id },
    orderBy: { id: "asc" },
  });

  for (const link of calculateProbabilities(links)) {
    await prisma.link.update({
      where: { id: link.id },
      data: { probability: link.probability },
    });
  }

  const final = await prisma.link.findMany({
    where: { splitterId: splitter.id },
    orderBy: { id: "asc" },
  });

  console.log(`\n✅ Projeto "${PROJECT_NAME}" criado.\n`);
  console.log("   Distribuição calculada a partir do eCPM:\n");

  for (let index = 0; index < final.length; index += 1) {
    const link = final[index];
    const share = `${link.probability.toFixed(1)}%`.padStart(6);
    console.log(`   ${share}  ${link.utms.utm_campaign.padEnd(14)} ${LINKS[index].nota}`);
  }

  console.log(`\n   Teste o redirect em: http://${DOMAIN}/go/demo\n`);
}

main()
  .catch((error) => {
    console.error("❌ Falha ao popular o banco:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
