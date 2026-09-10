import { getGoogleAuth } from "./client.js";
import { reportDisplayName } from "./createGamReport.js";

const BASE_URL = "https://admanager.googleapis.com/v1";

/**
 * Garante que o relatório da conexão soma a janela pedida no painel.
 *
 * A janela mora na definição do relatório, lá no Ad Manager: mudá-la no
 * painel não muda nada até alguém reescrever o relatório. Fazer isso na
 * própria sincronização evita o passo manual de reabrir cada conexão.
 *
 * Só mexe no relatório que o painel criou — reconhecido pelo nome. Um
 * relatório que o operador montou à mão é dele, e reescrever a janela dele
 * seria mudar o que ele vê no Ad Manager.
 *
 * @returns {string|null} a janela anterior, quando houve troca.
 */
export async function ensureReportRange({
  networkCode,
  reportId,
  reportKey,
  dateRange,
}) {
  if (!networkCode || !reportId || !dateRange) return null;

  const auth = getGoogleAuth();
  const url = `${BASE_URL}/networks/${networkCode}/reports/${reportId}`;

  const atual = (await auth.request({ url, method: "GET" })).data || {};

  if (atual.displayName !== reportDisplayName(reportKey)) return null;

  const definition = atual.reportDefinition;
  const janelaAtual = definition?.dateRange?.relative;

  if (!definition || janelaAtual === dateRange) return null;

  await auth.request({
    url: `${url}?updateMask=reportDefinition`,
    method: "PATCH",
    data: {
      reportDefinition: { ...definition, dateRange: { relative: dateRange } },
    },
  });

  return janelaAtual ?? null;
}
