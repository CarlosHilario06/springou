import { getGoogleAuth } from "./client.js";
import { listGamReports } from "./listGamReports.js";
import { describeGoogleError } from "./errors.js";

const BASE_URL = "https://admanager.googleapis.com/v1";

/**
 * Janela que alimenta a otimização. Sete dias equilibra ter volume
 * suficiente por campanha e acompanhar mudança de eCPM sem inércia.
 */
const DATE_RANGE = "LAST_7_DAYS";

/** Nome do relatório criado — serve de chave para não duplicar. */
export function reportDisplayName(reportKey) {
  return `Springou · ${reportKey}`;
}

/**
 * As combinações que o sincronizador sabe ler, da mais desejável à mais
 * conservadora.
 *
 * O Ad Manager recusa certas misturas de dimensão, métrica e filtro com um
 * `REPORT_ERROR_CONSTRAINTS_INCOMPATIBILITY` seco, e quais valem depende da
 * rede: uma que só serve pelo ad server aceita coisas que outra, com
 * Ad Exchange, não aceita. Em vez de adivinhar, tenta em ordem e fica com a
 * primeira que a rede aceitar.
 *
 * O que nunca muda: a dimensão `KEY_VALUES_NAME`, que devolve
 * `chave=valor`, e três métricas na ordem impressões, eCPM e receita — é o
 * contrato que `parseGamRows` lê por posição.
 */
export function reportVariants(reportKey = "utm_campaign") {
  const base = {
    reportType: "HISTORICAL",
    dateRange: { relative: DATE_RANGE },
    dimensions: ["KEY_VALUES_NAME"],
  };

  const somenteAChave = [
    {
      fieldFilter: {
        field: { dimension: "KEY_VALUES_NAME" },
        operation: "CONTAINS",
        values: [{ stringValue: `${reportKey}=` }],
      },
    },
  ];

  const totais = ["IMPRESSIONS", "AVERAGE_ECPM", "REVENUE"];
  const adServer = [
    "AD_SERVER_IMPRESSIONS",
    "AD_SERVER_AVERAGE_ECPM",
    "AD_SERVER_REVENUE",
  ];

  return [
    {
      rotulo: "totais, filtrado pela chave",
      definition: { ...base, metrics: totais, filters: somenteAChave },
    },
    {
      rotulo: "totais, sem filtro",
      definition: { ...base, metrics: totais },
    },
    {
      rotulo: "ad server, filtrado pela chave",
      definition: { ...base, metrics: adServer, filters: somenteAChave },
    },
    {
      rotulo: "ad server, sem filtro",
      definition: { ...base, metrics: adServer },
    },
  ];
}

/** A primeira variante — a que a gente prefere quando a rede deixa. */
export function buildReportDefinition(reportKey = "utm_campaign") {
  return reportVariants(reportKey)[0].definition;
}

/**
 * Cria (ou reaproveita) o relatório do Springou numa rede.
 *
 * Criado pela API, o relatório nasce pertencendo à conta de serviço — que
 * é o que resolve o problema de visibilidade: relatório salvo pela
 * interface pertence a quem o criou e a API não o enxerga.
 *
 * Clicar duas vezes não gera dois relatórios: se já existir um com o mesmo
 * nome, ele é devolvido como está.
 */
export async function createGamReport({
  networkCode,
  reportKey = "utm_campaign",
}) {
  if (!networkCode) throw new Error("networkCode não informado");

  const displayName = reportDisplayName(reportKey);

  const existentes = await listGamReports({ networkCode });
  const jaCriado = existentes.find((item) => item.name === displayName);

  if (jaCriado) return { ...jaCriado, reused: true };

  const auth = getGoogleAuth();
  const recusas = [];

  for (const variante of reportVariants(reportKey)) {
    let resposta;

    try {
      resposta = await auth.request({
        url: `${BASE_URL}/networks/${networkCode}/reports`,
        method: "POST",
        data: {
          displayName,
          // VISIBLE deixa ele aparecer também na interface do Ad Manager,
          // para conferência — não é o que dá acesso à API.
          visibility: "VISIBLE",
          reportDefinition: variante.definition,
        },
      });
    } catch (error) {
      recusas.push(`${variante.rotulo}: ${describeGoogleError(error)}`);
      continue;
    }

    const criado = resposta.data || {};
    const id = criado.reportId ?? String(criado.name || "").split("/").pop();

    if (!id) throw new Error("O GAM não devolveu o ID do relatório criado");

    return {
      id: String(id),
      name: criado.displayName || displayName,
      variant: variante.rotulo,
      reused: false,
    };
  }

  // Nenhuma combinação passou: mostra o que cada uma ouviu do Google, que é
  // o que permite ajustar sem ficar no escuro.
  throw new Error(
    `O Ad Manager recusou todas as combinações. ${recusas.join(" | ")}`
  );
}
