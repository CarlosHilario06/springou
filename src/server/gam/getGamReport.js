import { getGoogleAuth } from "./client.js";
import { parseGamRows } from "./parseGamRows.js";
import { describeGoogleError } from "./errors.js";
import { env } from "../env.js";

const POLL_ATTEMPTS = 20;
const POLL_INTERVAL_MS = 3000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  const runResponse = await auth.request({
    url: `${baseUrl}/networks/${networkCode}/reports/${reportId}:run`,
    method: "POST",
    data: {},
  });

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
