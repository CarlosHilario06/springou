import prisma from "../prisma.js";
import { verifyToken } from "./tokens.js";

/**
 * Marca os 401 causados pelo token, para o painel distinguir "sessão
 * vencida" de "credencial errada no formulário" e não deslogar à toa.
 */
export const SESSION_INVALID = "SESSION_INVALID";

function extractToken(req) {
  const header = req.get("authorization") || "";
  const [scheme, token] = header.split(" ");

  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token.trim();
}

/**
 * Bloqueia a requisição se não houver um JWT válido de um usuário existente.
 * Anexa o usuário em `req.user`.
 */
export async function requireAuth(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    return res
      .status(401)
      .json({ error: "Autenticação obrigatória", code: SESSION_INVALID });
  }

  const payload = verifyToken(token);

  if (!payload?.sub) {
    return res
      .status(401)
      .json({ error: "Sessão inválida ou expirada", code: SESSION_INVALID });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: Number(payload.sub) },
      select: { id: true, email: true, name: true },
    });

    // Token válido mas usuário removido: a sessão não vale mais nada.
    if (!user) {
      return res
        .status(401)
        .json({ error: "Sessão inválida ou expirada", code: SESSION_INVALID });
    }

    req.user = user;
    return next();
  } catch (error) {
    console.error("Erro ao validar sessão:", error);
    return res.status(500).json({ error: "Erro ao validar sessão" });
  }
}
