import { getGoogleAuth } from "./client.js";
import { listGamReports } from "./listGamReports.js";
import { describeGoogleError } from "./errors.js";

const BASE_URL = "https://admanager.googleapis.com/v1";

/**
 * Janelas oferecidas no painel, no vocabulário do Ad Manager. A escolha
 * muda o que a otimização enxerga: uma janela curta reage rápido a mudança
 * de eCPM, uma longa dá mais volume por campanha. O padrão é o dia
 * corrente, que é como a operação lê o desempenho.
 */
export const DATE_RANGES = [
  "TODAY",
  "YESTERDAY",
  "LAST_7_DAYS",
  "LAST_30_DAYS",
  "THIS_MONTH_TO_DATE",
  "LAST_MONTH",
];

export const DEFAULT_DATE_RANGE = "TODAY";

/** Nome do relatório criado — serve de chave para não duplicar. */
export function reportDisplayName(reportKey) {
  return `Springou · ${reportKey}`;
}

/**
 * Tudo que vale a pena perguntar à rede, do mais simples ao mais completo.
 *
 * O Ad Manager recusa combinações de dimensão e métrica com um
 * `REPORT_ERROR_CONSTRAINTS_INCOMPATIBILITY` que não diz qual parte
 * ofendeu, e o que ele aceita varia de rede para rede. Como todas as
 * tentativas são `patch` no mesmo relatório, sai barato perguntar tudo de
 * uma vez: as marcadas `usavel` servem ao sincronizador, as demais existem
 * só para localizar a parede.
 *
 * `usavel` exige o contrato de `parseGamRows`: dimensão `KEY_VALUES_NAME`,
 * que devolve `chave=valor`, e três métricas na ordem impressões, eCPM e
 * receita.
 */
export function reportAttempts(
  reportKey = "utm_campaign",
  dateRange = DEFAULT_DATE_RANGE
) {
  const base = { reportType: "HISTORICAL", dateRange: { relative: dateRange } };
  const porChave = { ...base, dimensions: ["KEY_VALUES_NAME"] };

  const diagnostico = (rotulo, definition) => ({
    rotulo,
    usavel: false,
    definition,
  });

  const somenteAChave = [
    {
      fieldFilter: {
        field: { dimension: "KEY_VALUES_NAME" },
        operation: "CONTAINS",
        values: [{ stringValue: `${reportKey}=` }],
      },
    },
  ];

  // Cada família vem em duas formas: com filtro pela chave, que evita
  // trazer todas as chaves-valor da rede, e sem — porque o filtro é mais
  // uma coisa que a rede pode recusar.
  const familia = (rotulo, impressoes, ecpm, receita) => {
    const metrics = [impressoes, ecpm, receita];

    return [
      {
        rotulo: `${rotulo}, filtrado pela chave`,
        usavel: true,
        definition: { ...porChave, metrics, filters: somenteAChave },
      },
      {
        rotulo: `${rotulo}, sem filtro`,
        usavel: true,
        definition: { ...porChave, metrics },
      },
    ];
  };

  const sozinha = (rotulo, metrica) =>
    diagnostico(rotulo, { ...porChave, metrics: ["IMPRESSIONS", metrica] });

  return [
    // Base: confirma que o problema não é o período nem o tipo.
    diagnostico("só impressões, sem dimensão", {
      ...base,
      dimensions: [],
      metrics: ["IMPRESSIONS"],
    }),
    diagnostico("por data", {
      ...base,
      dimensions: ["DATE"],
      metrics: ["IMPRESSIONS"],
    }),
    diagnostico("por chave-valor", { ...porChave, metrics: ["IMPRESSIONS"] }),

    // Cada métrica de dinheiro sozinha, para saber qual delas ofende.
    sozinha("+ receita total", "REVENUE"),
    sozinha("+ eCPM total", "AVERAGE_ECPM"),
    sozinha("+ receita do ad server", "AD_SERVER_REVENUE"),
    sozinha("+ eCPM do ad server", "AD_SERVER_AVERAGE_ECPM"),
    sozinha("+ receita do Ad Exchange", "AD_EXCHANGE_REVENUE"),
    sozinha("+ eCPM do Ad Exchange", "AD_EXCHANGE_AVERAGE_ECPM"),

    // As formas completas. Cada família traz as próprias impressões: medir
    // receita do Ad Exchange contra impressões totais daria confiança demais
    // a um sinal que veio de uma fatia menor da entrega.
    ...familia("totais", "IMPRESSIONS", "AVERAGE_ECPM", "REVENUE"),
    ...familia(
      "ad server",
      "AD_SERVER_IMPRESSIONS",
      "AD_SERVER_AVERAGE_ECPM",
      "AD_SERVER_REVENUE"
    ),
    ...familia(
      "Ad Exchange",
      "AD_EXCHANGE_IMPRESSIONS",
      "AD_EXCHANGE_AVERAGE_ECPM",
      "AD_EXCHANGE_REVENUE"
    ),
    // Último recurso: receita do Ad Exchange com impressões totais, que foi
    // o que algumas redes aceitaram antes de as impressões do AdX entrarem.
    ...familia(
      "Ad Exchange com impressões totais",
      "IMPRESSIONS",
      "AD_EXCHANGE_AVERAGE_ECPM",
      "AD_EXCHANGE_REVENUE"
    ),
  ];
}

/** A forma pretendida quando a rede aceita tudo. */
export function buildReportDefinition(
  reportKey = "utm_campaign",
  dateRange = DEFAULT_DATE_RANGE
) {
  return reportAttempts(reportKey, dateRange).find((item) => item.usavel)
    .definition;
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
  dateRange = DEFAULT_DATE_RANGE,
}) {
  if (!networkCode) throw new Error("networkCode não informado");

  const auth = getGoogleAuth();
  const displayName = reportDisplayName(reportKey);
  const tentativas = reportAttempts(reportKey, dateRange);

  const existentes = await listGamReports({ networkCode });
  const jaCriado = existentes.find((item) => item.name === displayName);

  let reportId = jaCriado?.id ?? null;
  let melhor = null;
  let ultimaAplicada = null;
  const resultados = [];

  // Percorre todas: são patches no mesmo recurso, então perguntar tudo
  // custa pouco e responde de uma vez qual métrica a rede recusa.
  for (const tentativa of tentativas) {
    try {
      if (reportId) {
        await trocarDefinicao(auth, networkCode, reportId, tentativa.definition);
      } else {
        reportId = await criarComDefinicao(
          auth,
          networkCode,
          displayName,
          tentativa.definition
        );
      }

      ultimaAplicada = tentativa;
      resultados.push({ rotulo: tentativa.rotulo, ok: true });

      if (tentativa.usavel && !melhor) melhor = tentativa;
    } catch (error) {
      resultados.push({
        rotulo: tentativa.rotulo,
        ok: false,
        motivo: describeGoogleError(error),
      });
    }
  }

  if (!reportId) {
    const erro = new Error(
      `O Ad Manager não aceitou criar nem o relatório mais simples. ` +
        resultados.map((r) => `${r.rotulo}: ${r.motivo}`).join(" | ")
    );
    erro.fromGam = true;
    throw erro;
  }

  // O relatório ficou com a última definição aplicada, que pode não ser a
  // melhor: devolve ele à forma escolhida.
  if (melhor && ultimaAplicada !== melhor) {
    await trocarDefinicao(auth, networkCode, reportId, melhor.definition);
  }

  return {
    id: reportId,
    name: displayName,
    usable: Boolean(melhor),
    variant: melhor?.rotulo ?? ultimaAplicada?.rotulo ?? null,
    attempts: resultados,
    reused: Boolean(jaCriado),
  };
}
