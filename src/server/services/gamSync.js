import prisma from "../prisma.js";
import { getGamReportRows } from "../gam/getGamReport.js";
import { describeGoogleError } from "../gam/errors.js";
import { ensureReportRange } from "../gam/ensureReportRange.js";
import { optimizeTrafficProbabilities } from "./optimizer.js";

export const gamSyncState = {
  running: false,
  lastSyncAt: null,
  lastError: null,
};

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

/** Tira o "utm_campaign=" que vem colado quando o valor é copiado direto
 *  da coluna chave-valor do relatório. */
function stripKeyPrefix(value) {
  const text = normalize(value);
  return text.startsWith("utm_campaign=")
    ? text.slice("utm_campaign=".length).trim()
    : text;
}

function readCampaign(link) {
  const utms = link.utms;

  if (!utms) return "";

  if (typeof utms === "string") {
    try {
      return stripKeyPrefix(JSON.parse(utms)?.utm_campaign);
    } catch {
      return "";
    }
  }

  return stripKeyPrefix(utms.utm_campaign);
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

    const current = target.get(key);

    // Primeira aparição: fica o eCPM que o Google reportou. Recalcular
    // receita ÷ impressões daria um número levemente diferente do que
    // aparece no painel do Ad Manager, e a divergência confunde.
    if (!current) {
      target.set(key, {
        impressions: Number(row.impressions) || 0,
        revenue: Number(row.revenue) || 0,
        ecpm: Number(row.ecpm) || 0,
      });
      continue;
    }

    // Mesma campanha vindo de outra rede: agora só a média ponderada
    // sobre o total faz sentido.
    current.impressions += Number(row.impressions) || 0;
    current.revenue += Number(row.revenue) || 0;
    current.ecpm =
      current.impressions > 0
        ? (current.revenue / current.impressions) * 1000
        : current.ecpm;
  }
}

/**
 * Puxa os relatórios do Ad Manager e reescreve eCPM/impressões/receita dos
 * links, casando pela UTM `utm_campaign`. No fim, reotimiza as probabilidades.
 *
 * Métricas só são zeradas quando pelo menos uma conexão respondeu — se tudo
 * falhar, os dados anteriores continuam valendo em vez de virar zero.
 */
export async function syncGamConnections({
  connectionId,
  // Injetável para os testes conseguirem exercitar o casamento por
  // utm_campaign sem chamar o Google.
  fetchRows = getGamReportRows,
} = {}) {
  if (gamSyncState.running) {
    return { skipped: true, reason: "Sincronização já em andamento" };
  }

  gamSyncState.running = true;
  gamSyncState.lastError = null;

  const summary = {
    connections: [],
    matchedLinks: 0,
    clearedLinks: 0,
    campaigns: [],
  };

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
        // A janela vive na definição do relatório, no Ad Manager: mudá-la
        // no painel só vale depois de reescrever o relatório. Faz isso
        // aqui para o operador não precisar reabrir a conexão.
        try {
          const janelaAntiga = await ensureReportRange({
            networkCode: connection.networkCode,
            reportId: connection.reportId,
            reportKey: connection.reportType,
            dateRange: connection.reportRange,
          });

          if (janelaAntiga) {
            console.log(
              `↻ GAM "${connection.name}": janela do relatório de ${janelaAntiga} para ${connection.reportRange}`
            );
          }
        } catch (error) {
          // Ajustar a janela é conveniência, não requisito: se falhar, o
          // relatório roda com a janela que já tinha em vez de a conexão
          // inteira quebrar.
          console.error(
            `⚠️  GAM "${connection.name}": não consegui conferir a janela do relatório —`,
            describeGoogleError(error)
          );
        }

        const rows = await fetchRows({
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
        const message = describeGoogleError(error);
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

    // As campanhas que o relatório trouxe. Sem isso, um sync que não casa
    // nada é indistinguível de um relatório vazio — e não há como saber que
    // utm_campaign usar nos links.
    summary.campaigns = [...metricsByCampaign.keys()].sort().slice(0, 200);

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
