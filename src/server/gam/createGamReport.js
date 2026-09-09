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
 * Os degraus entre um relatório trivial e o que o sincronizador precisa.
 *
 * O Ad Manager recusa combinações de dimensão, métrica e filtro com um
 * `REPORT_ERROR_CONSTRAINTS_INCOMPATIBILITY` que não diz qual parte
 * ofendeu, e o que ele aceita varia de rede para rede. Em vez de adivinhar,
 * a criação sobe esta escada e para no último degrau que a rede aceitar —
 * o degrau que falhou é o diagnóstico.
 *
 * A partir de `usavel: true` o relatório atende o contrato de
 * `parseGamRows`: dimensão `KEY_VALUES_NAME`, que devolve `chave=valor`, e
 * três métricas na ordem impressões, eCPM e receita.
 */
export function reportLadder(reportKey = "utm_campaign") {
  const base = { reportType: "HISTORICAL", dateRange: { relative: DATE_RANGE } };

  const totais = ["IMPRESSIONS", "AVERAGE_ECPM", "REVENUE"];

  const somenteAChave = [
    {
      fieldFilter: {
        field: { dimension: "KEY_VALUES_NAME" },
        operation: "CONTAINS",
        values: [{ stringValue: `${reportKey}=` }],
      },
    },
  ];

  return [
    {
      rotulo: "só impressões, sem dimensão",
      usavel: false,
      definition: { ...base, dimensions: [], metrics: ["IMPRESSIONS"] },
    },
    {
      rotulo: "por data",
      usavel: false,
      definition: { ...base, dimensions: ["DATE"], metrics: ["IMPRESSIONS"] },
    },
    {
      rotulo: "por chave-valor",
      usavel: false,
      definition: {
        ...base,
        dimensions: ["KEY_VALUES_NAME"],
        metrics: ["IMPRESSIONS"],
      },
    },
    {
      rotulo: "chave-valor com eCPM e receita",
      usavel: true,
      definition: {
        ...base,
        dimensions: ["KEY_VALUES_NAME"],
        metrics: totais,
      },
    },
    {
      rotulo: "chave-valor filtrado pela chave",
      usavel: true,
      definition: {
        ...base,
        dimensions: ["KEY_VALUES_NAME"],
        metrics: totais,
        filters: somenteAChave,
      },
    },
  ];
}

/** A forma final pretendida — o topo da escada. */
export function buildReportDefinition(reportKey = "utm_campaign") {
  const escada = reportLadder(reportKey);
  return escada[escada.length - 1].definition;
}

async function criarComDefinicao(auth, networkCode, displayName, definition) {
  const resposta = await auth.request({
    url: `${BASE_URL}/networks/${networkCode}/reports`,
    method: "POST",
    data: {
      displayName,
      // VISIBLE deixa o relatório aparecer também na interface do Ad
      // Manager, para conferência — não é o que dá acesso à API.
      visibility: "VISIBLE",
      reportDefinition: definition,
    },
  });

  const criado = resposta.data || {};
  const id = criado.reportId ?? String(criado.name || "").split("/").pop();

  if (!id) throw new Error("O GAM não devolveu o ID do relatório criado");

  return String(id);
}

async function trocarDefinicao(auth, networkCode, reportId, definition) {
  await auth.request({
    url: `${BASE_URL}/networks/${networkCode}/reports/${reportId}?updateMask=reportDefinition`,
    method: "PATCH",
    data: { reportDefinition: definition },
  });
}

/**
 * Cria (ou reaproveita) na rede o relatório que o sincronizador sabe ler.
 *
 * Feito pela API, ele pertence à conta de serviço — que é o que resolve o
 * beco sem saída de um relatório salvo pela interface, privado de quem o
 * criou e invisível para a API.
 *
 * É um relatório só: a escada é percorrida com `patch` sobre o mesmo
 * recurso, então tentar de novo não deixa lixo na rede.
 */
export async function createGamReport({
  networkCode,
  reportKey = "utm_campaign",
}) {
  if (!networkCode) throw new Error("networkCode não informado");

  const auth = getGoogleAuth();
  const displayName = reportDisplayName(reportKey);
  const escada = reportLadder(reportKey);

  const existentes = await listGamReports({ networkCode });
  const jaCriado = existentes.find((item) => item.name === displayName);

  let reportId = jaCriado?.id ?? null;
  let aceito = null;
  let parede = null;
  const recusas = [];

  for (const degrau of escada) {
    try {
      if (reportId) {
        await trocarDefinicao(auth, networkCode, reportId, degrau.definition);
      } else {
        reportId = await criarComDefinicao(
          auth,
          networkCode,
          displayName,
          degrau.definition
        );
      }

      aceito = degrau;
    } catch (error) {
      const motivo = describeGoogleError(error);
      recusas.push(`${degrau.rotulo}: ${motivo}`);

      // O primeiro degrau recusado é o diagnóstico; os de cima seriam
      // recusados pelo mesmo motivo.
      parede = { rotulo: degrau.rotulo, motivo };
      break;
    }
  }

  if (!aceito) {
    const erro = new Error(
      `O Ad Manager recusou até o relatório mais simples nesta rede. ${recusas.join(" | ")}`
    );
    erro.fromGam = true;
    throw erro;
  }

  return {
    id: reportId,
    name: displayName,
    variant: aceito.rotulo,
    usable: aceito.usavel,
    wall: parede,
    reused: Boolean(jaCriado),
  };
}
