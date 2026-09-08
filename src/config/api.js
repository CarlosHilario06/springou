/**
 * Em desenvolvimento o painel roda no Vite (5173) e a API em outra porta,
 * então VITE_API_URL aponta para ela. Em produção os dois são servidos
 * pelo mesmo processo, e a URL vazia significa "mesma origem".
 */
export const API_URL = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");
