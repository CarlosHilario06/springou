import { getGoogleAuth } from "./client.js";
import { listGamReports } from "./listGamReports.js";

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
 * O relatório que o sincronizador sabe ler.
 *
 * `KEY_VALUES_NAME` devolve a chave-valor no formato `chave=valor`, que é
 * exatamente o que `parseGamRows` espera. As métricas vão na ordem em que
 * ele as lê: impressões, eCPM, receita. O filtro deixa passar só a chave
 * pedida, senão viriam todas as chaves-valor da rede.
 */
export function buildReportDefinition(reportKey = "utm_campaign") {
  return {
    reportType: "HISTORICAL",
    dateRange: { relative: DATE_RANGE },
    dimensions: ["KEY_VALUES_NAME"],
    metrics: ["IMPRESSIONS", "AVERAGE_ECPM", "REVENUE"],
    filters: [
      {
        fieldFilter: {
          field: { dimension: "KEY_VALUES_NAME" },
          operation: "CONTAINS",
          values: [{ stringValue: `${reportKey}=` }],
        },
      },
    ],
  };
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

  const response = await auth.request({
    url: `${BASE_URL}/networks/${networkCode}/reports`,
    method: "POST",
    data: {
      displayName,
      // VISIBLE deixa ele aparecer também na interface do Ad Manager, para
      // conferência — não é o que dá acesso à API.
      visibility: "VISIBLE",
      reportDefinition: buildReportDefinition(reportKey),
    },
  });

  const criado = response.data || {};

  const id =
    criado.reportId ?? String(criado.name || "").split("/").pop() ?? null;

  if (!id) throw new Error("O GAM não devolveu o ID do relatório criado");

  return { id: String(id), name: criado.displayName || displayName, reused: false };
}
