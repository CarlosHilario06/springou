import { API_URL } from "../config/api";

const TOKEN_KEY = "springou.token";
const USER_KEY = "springou.user";

/** Disparado quando a API recusa o token — o App usa para deslogar. */
export const UNAUTHORIZED_EVENT = "springou:unauthorized";

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSession(token, user) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    /* modo privado sem storage: a sessão vale só enquanto a aba estiver aberta */
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    /* nada a limpar */
  }
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/**
 * Wrapper de fetch que anexa o JWT e transforma erro da API em exceção
 * com a mensagem que o backend mandou.
 */
export async function api(path, { method = "GET", body, signal } = {}) {
  const token = getToken();

  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;

  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new ApiError("Não foi possível falar com o servidor", 0);
  }

  const isJson = response.headers
    .get("content-type")
    ?.includes("application/json");

  const payload = isJson ? await response.json() : null;

  // Só o 401 marcado pelo middleware significa sessão vencida. Senha errada
  // no login ou na troca de senha também responde 401 e não pode deslogar.
  if (response.status === 401 && payload?.code === "SESSION_INVALID") {
    clearSession();
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new ApiError("Sessão expirada. Entre novamente.", 401);
  }

  if (!response.ok) {
    throw new ApiError(
      payload?.error || `Erro ${response.status}`,
      response.status
    );
  }

  return payload;
}
