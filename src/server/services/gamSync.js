import prisma from "../prisma.js";
import { getGamReportRows } from "../gam/getGamReport.js";
import { optimizeTrafficProbabilities } from "./optimizer.js";

export const gamSyncState = {
  running: false,
  lastSyncAt: null,
  lastError: null,
};

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

function readCampaign(link) {
  const utms = link.utms;

  if (!utms) return "";

  if (typeof utms === "string") {
    try {
      return normalize(JSON.parse(utms)?.utm_campaign);
    } catch {
      return "";
    }
  }

  return normalize(utms.utm_campaign);
}

/**
 * Junta as linhas de todas as conexões numa única tabela por campanha.
 * Se a mesma campanha aparecer em mais de uma rede, soma os volumes e
 * recalcula o eCPM sobre o total — média simples distorceria o resultado.
 */
function mergeRows(target, rows) {
  for (const row of rows) {
    const key = normalize(row.value);
    if (!key) continue;

    const current = target.get(key) || { impressions: 0, revenue: 0, ecpm: 0 };

    current.impressions += Number(row.impressions) || 0;
    current.revenue += Number(row.revenue) || 0;
    current.ecpm =
      current.impressions > 0
        ? (current.revenue / current.impressions) * 1000
        : Number(row.ecpm) || 0;

    target.set(key, current);
  }
}

/**
 * Puxa os relatórios do Ad Manager e reescreve eCPM/impressões/receita dos
 * links, casando pela UTM `utm_campaign`. No fim, reotimiza as probabilidades.
 *
 * Métricas só são zeradas quando pelo menos uma conexão respondeu — se tudo
 * falhar, os dados anteriores continuam valendo em vez de virar zero.
 */
export async function syncGamConnections({ connectionId } = {}) {
  if (gamSyncState.running) {
    return { skipped: true, reason: "Sincronização já em andamento" };
  }

  gamSyncState.running = true;
  gamSyncState.lastError = null;

  const summary = { connections: [], matchedLinks: 0, clearedLinks: 0 };

  try {
    const connections = await prisma.gamConnection.findMany({
      where: connectionId ? { id: Number(connectionId) } : { active: true },
    });

    if (connections.length === 0) {
      return { ...summary, skipped: true, reason: "Nenhuma conexão ativa" };
    }

    const metricsByCampaign = new Map();
    let anySucceeded = false;

    for (const connection of connections) {
      try {
        const rows = await getGamReportRows({
          networkCode: connection.networkCode,
          reportId: connection.reportId,
          reportType: connection.reportType,
        });

        mergeRows(metricsByCampaign, rows);
        anySucceeded = true;

        await prisma.gamConnection.update({
          where: { id: connection.id },
          data: {
            status: "connected",
            lastError: null,
            lastSyncAt: new Date(),
          },
        });

        summary.connections.push({
          id: connection.id,
          name: connection.name,
          ok: true,
          rows: rows.length,
        });
      } catch (error) {
        const message = error?.message || String(error);
        console.error(`❌ GAM "${connection.name}":`, message);

        await prisma.gamConnection.update({
          where: { id: connection.id },
          data: { status: "error", lastError: message.slice(0, 500) },
        });

        summary.connections.push({
          id: connection.id,
          name: connection.name,
          ok: false,
          error: message,
        });
      }
    }

    if (!anySucceeded) {
      // Sem isso o painel só mostra o genérico e o usuário fica sem saber
      // o que o Google recusou.
      const failed = summary.connections.find((item) => !item.ok);

      throw new Error(
        failed?.error
          ? `Falha ao sincronizar "${failed.name}": ${failed.error}`
          : "Nenhuma conexão do GAM respondeu"
      );
    }

    const links = await prisma.link.findMany();
    const updates = [];

    for (const link of links) {
      const campaign = readCampaign(link);

      // Link sem utm_campaign não tem como ser casado com o relatório.
      if (!campaign) continue;

      const metrics = metricsByCampaign.get(campaign);

      if (metrics) {
        summary.matchedLinks += 1;
        updates.push(
          prisma.link.update({
            where: { id: link.id },
            data: {
              ecpm: Number(metrics.ecpm.toFixed(4)),
              impressions: Math.round(metrics.impressions),
              revenue: Number(metrics.revenue.toFixed(4)),
            },
          })
        );
        continue;
      }

      // Campanha sem entrega no período: métricas voltam a zero.
      const alreadyZero =
        link.ecpm === 0 && link.impressions === 0 && link.revenue === 0;

      if (alreadyZero) continue;

      summary.clearedLinks += 1;
      updates.push(
        prisma.link.update({
          where: { id: link.id },
          data: { ecpm: 0, impressions: 0, revenue: 0 },
        })
      );
    }

    if (updates.length > 0) await prisma.$transaction(updates);

    await optimizeTrafficProbabilities();

    gamSyncState.lastSyncAt = new Date();

    console.log(
      `✅ GAM sincronizado — ${summary.matchedLinks} links atualizados`
    );

    return summary;
  } catch (error) {
    gamSyncState.lastError = error?.message || String(error);
    console.error("❌ Erro na sincronização do GAM:", error);
    throw error;
  } finally {
    gamSyncState.running = false;
  }
}
