import { Router } from "express";
import bcrypt from "bcryptjs";
import prisma from "../prisma.js";
import { signToken } from "../auth/tokens.js";
import { requireAuth } from "../auth/middleware.js";
import { badRequest, requireString } from "../lib/http.js";

const router = Router();

router.post("/login", async (req, res, next) => {
  try {
    const email = requireString(req.body?.email, "E-mail").toLowerCase();
    const password = requireString(req.body?.password, "Senha", {
      maxLength: 200,
    });

    const user = await prisma.user.findUnique({ where: { email } });

    // Mesmo hash falso quando o usuário não existe: o tempo de resposta não
    // deve revelar quais e-mails estão cadastrados.
    const hash = user?.passwordHash || "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva";
    const passwordMatches = await bcrypt.compare(password, hash);

    if (!user || !passwordMatches) {
      return res.status(401).json({ error: "E-mail ou senha incorretos" });
    }

    return res.json({
      token: signToken(user),
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

router.post("/change-password", requireAuth, async (req, res, next) => {
  try {
    const currentPassword = requireString(
      req.body?.currentPassword,
      "Senha atual",
      { maxLength: 200 }
    );
    const newPassword = requireString(req.body?.newPassword, "Nova senha", {
      maxLength: 200,
    });

    if (newPassword.length < 8) {
      throw badRequest("A nova senha precisa ter ao menos 8 caracteres");
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const matches = await bcrypt.compare(currentPassword, user.passwordHash);

    if (!matches) {
      return res.status(401).json({ error: "Senha atual incorreta" });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(newPassword, 12) },
    });

    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

export default router;
