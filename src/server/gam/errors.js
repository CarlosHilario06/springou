/**
 * Traduz o erro que o Google devolve para uma frase que diga o que fazer.
 *
 * A biblioteca do Google embrulha a resposta HTTP e, quando a API não
 * manda um `message`, sobra um "An error has occurred." — que não ajuda
 * ninguém. Aqui a gente cava o corpo da resposta e junta status, motivo e
 * mensagem, que é o que aparece na linha da conexão no painel.
 */

/** Motivos conhecidos do GAM, com o conserto de cada um. */
const DICAS = {
  SERVICE_DISABLED:
    "Ative a API do Ad Manager no projeto do Google Cloud (console.cloud.google.com/apis/library/admanager.googleapis.com).",
  ACCESS_TOKEN_SCOPE_INSUFFICIENT:
    "A credencial não tem o escopo do Ad Manager.",
  PERMISSION_DENIED:
    "A conta de serviço não está cadastrada nessa rede, ou não tem permissão para executar relatórios.",
  NOT_FOUND:
    "Network code ou ID do relatório não existe para esta credencial. Confira se o relatório é dessa rede.",
  UNAUTHENTICATED: "A credencial foi recusada pelo Google.",
};

function extrairMotivos(api) {
  const details = Array.isArray(api?.details) ? api.details : [];

  return details
    .flatMap((item) => {
      if (item?.reason) return [item.reason];
      if (Array.isArray(item?.errors)) {
        return item.errors.map((erro) => erro?.reason).filter(Boolean);
      }
      return [];
    })
    .filter(Boolean);
}

export function describeGoogleError(error) {
  const resposta = error?.response;
  const corpo = resposta?.data;
  const api = corpo?.error;

  const partes = [];
  const status = api?.code ?? resposta?.status;

  if (status) partes.push(`HTTP ${status}`);
  if (api?.status) partes.push(api.status);

  const motivos = extrairMotivos(api);
  const mensagem = api?.message || error?.message;

  if (mensagem) partes.push(mensagem);
  if (motivos.length > 0) partes.push(`(${motivos.join(", ")})`);

  // A dica vem do motivo específico ou, na falta dele, do status geral.
  const dica =
    motivos.map((motivo) => DICAS[motivo]).find(Boolean) ||
    DICAS[api?.status] ||
    null;

  if (dica) partes.push(`→ ${dica}`);

  // Nem toda falha é da API: erro de rede, JSON inválido, timeout do poll.
  if (partes.length === 0) return error?.message || String(error);

  // Resposta que não é JSON (página de erro, proxy): dá uma amostra.
  if (!api && typeof corpo === "string" && corpo.trim()) {
    partes.push(`corpo: ${corpo.trim().slice(0, 200)}`);
  }

  return partes.join(" · ");
}
