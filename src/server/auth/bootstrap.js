import bcrypt from "bcryptjs";
import prisma from "../prisma.js";
import { env } from "../env.js";

/**
 * Cria o primeiro admin a partir do .env, apenas enquanto não existir
 * nenhum usuário. Depois disso as variáveis são ignoradas — a gestão de
 * senha passa a ser pelo painel.
 */
export async function ensureAdminUser() {
  const userCount = await prisma.user.count();

  if (userCount > 0) return;

  if (!env.adminEmail || !env.adminPassword) {
    console.warn(
      "⚠️  Nenhum usuário cadastrado e ADMIN_EMAIL/ADMIN_PASSWORD não definidos."
    );
    console.warn("   Preencha os dois no .env e reinicie para criar o acesso.");
    return;
  }

  if (env.adminPassword.length < 8) {
    console.warn("⚠️  ADMIN_PASSWORD tem menos de 8 caracteres. Admin não criado.");
    return;
  }

  const passwordHash = await bcrypt.hash(env.adminPassword, 12);

  await prisma.user.create({
    data: {
      email: env.adminEmail.toLowerCase(),
      name: "Administrador",
      passwordHash,
    },
  });

  console.log(`✅ Usuário admin criado: ${env.adminEmail}`);
  console.log("   Troque a senha pelo painel e remova ADMIN_PASSWORD do .env.");
}
