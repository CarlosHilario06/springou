import { getGoogleAuth } from "./client.js";

const BASE_URL = "https://admanager.googleapis.com/v1";

/**
 * Lista os relatórios que a credencial atual enxerga numa rede.
 *
 * Relatório salvo no GAM tem dono: quem criou pelo painel não é
 * necessariamente quem a API vê. Poder listar é o que transforma "ID não
 * encontrado" em "use um destes".
 */
export async function listGamReports({ networkCode, pageSize = 100 }) {
  if (!networkCode) throw new Error("networkCode não informado");

  const auth = getGoogleAuth();

  const response = await auth.request({
    url: `${BASE_URL}/networks/${networkCode}/reports?pageSize=${pageSize}`,
    method: "GET",
  });

  return (response.data?.reports || []).map((report) => ({
    id: String(report.name || "").split("/").pop(),
    name: report.displayName || "(sem nome)",
  }));
}
