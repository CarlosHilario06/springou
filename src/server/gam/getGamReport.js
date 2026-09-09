import { getGoogleAuth } from "./client.js";
import { parseGamRows } from "./parseGamRows.js";
import { describeGoogleError } from "./errors.js";
import { listGamReports } from "./listGamReports.js";
import { env } from "../env.js";

const POLL_ATTEMPTS = 20;
const POLL_INTERVAL_MS = 3000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Complementa o erro com os relatórios que a credencial realmente vê. */
async function sugerirRelatorios(networkCode, reportId) {
  let relatorios;

  try {
    relatorios = await listGamReports({ networkCode });
  } catch {
    // Se nem listar dá, o problema é anterior ao relatório: deixa o erro
    // original falar sozinho.
    return "";
  }

  if (relatorios.length === 0) {
    return (
      ` · A credencial não enxerga nenhum relatório nesta rede.` +
      ` No GAM, abra o relatório ${reportId} e compartilhe com todos da rede` +
      ` (relatório salvo é privado de quem criou).`
    );
  }

  const lista = relatorios
    .slice(0, 8)
    .map((item) => `${item.id} (${item.name})`)
    .join(", ");

  const resto =
    relatorios.length > 8 ? ` e mais ${relatorios.length - 8}` : "";

  return ` · Relatórios visíveis nesta rede: ${lista}${resto}.`;
}

/**
 * Dispara um relatório salvo do Ad Manager, espera ficar pronto e devolve
 * as linhas já normalizadas.
 */
export async function getGamReportRows(options = {}) {
  const networkCode = options.networkCode || env.gam.networkCode;
  const reportId = options.reportId || env.gam.reportId;
  const reportType = options.reportType || "utm_campaign";

  if (!networkCode) throw new Error("networkCode não informado");
  if (!reportId) throw new Error("reportId não informado");

  const auth = getGoogleAuth();
  const baseUrl = "https://admanager.googleapis.com/v1";

  let runResponse;

  try {
    runResponse = await auth.request({
      url: `${baseUrl}/networks/${networkCode}/reports/${reportId}:run`,
      method: "POST",
      data: {},
    });
  } catch (error) {
    // O ID não serve para esta credencial. Dizer quais servem economiza
    // uma rodada inteira de tentativa e erro.
    throw new Error(
      `${describeGoogleError(error)}${await sugerirRelatorios(networkCode, reportId)}`,
      { cause: error }
    );
  }

  const operationName = runResponse.data?.name;

  if (!operationName) {
    throw new Error("GAM não retornou a operação do relatório");
  }

  let operation = null;

  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    const statusResponse = await auth.request({
      url: `${baseUrl}/${operationName}`,
      method: "GET",
    });

    operation = statusResponse.data;

    if (operation?.done) break;

    await sleep(POLL_INTERVAL_MS);
  }

  if (!operation?.done) {
    throw new Error("Relatório do GAM não ficou pronto a tempo");
  }

  if (operation.error) {
    // A operação falhou do lado do Google: o erro vem no mesmo formato da
    // resposta HTTP, então reaproveita o mesmo tradutor.
    throw new Error(
      `GAM recusou o relatório: ${describeGoogleError({
        response: { data: { error: operation.error } },
      })}`
    );
  }

  const reportResult = operation.response?.reportResult;

  if (!reportResult) throw new Error("GAM não retornou reportResult");

  const rowsResponse = await auth.request({
    url: `${baseUrl}/${reportResult}:fetchRows?pageSize=10000`,
    method: "GET",
  });

  return parseGamRows(rowsResponse.data?.rows || [], reportType);
}
