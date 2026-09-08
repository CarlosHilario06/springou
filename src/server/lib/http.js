/** Erro com status HTTP, tratado pelo handler central. */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function badRequest(message) {
  return new HttpError(400, message);
}

export function notFound(message = "Recurso não encontrado") {
  return new HttpError(404, message);
}

export function conflict(message) {
  return new HttpError(409, message);
}

/** Lê um :param numérico da URL, recusando lixo antes de chegar no banco. */
export function parseId(value, label = "id") {
  const id = Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    throw badRequest(`${label} inválido`);
  }

  return id;
}

export function requireString(value, label, { maxLength = 255 } = {}) {
  const text = String(value ?? "").trim();

  if (!text) throw badRequest(`${label} é obrigatório`);
  if (text.length > maxLength) {
    throw badRequest(`${label} excede ${maxLength} caracteres`);
  }

  return text;
}

export function optionalString(value, { maxLength = 255 } = {}) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

/** Aceita apenas http/https — o loader injeta a URL num redirect. */
export function requireHttpUrl(value, label = "URL") {
  const text = requireString(value, label, { maxLength: 2048 });

  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    throw badRequest(`${label} inválida`);
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw badRequest(`${label} deve começar com http:// ou https://`);
  }

  return parsed.toString();
}

/** Normaliza o domínio para comparar rota e Host da requisição. */
export function normalizeDomain(value) {
  let text = String(value ?? "").trim().toLowerCase();

  if (!text) return "";

  text = text.replace(/^https?:\/\//, "");
  text = text.replace(/\/.*$/, "");
  text = text.replace(/\.$/, "");

  return text;
}

export function normalizeSlug(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}
