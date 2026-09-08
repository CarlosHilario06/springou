import { Router } from "express";
import prisma from "../prisma.js";
import { notFound, parseId, requireString } from "../lib/http.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const projects = await prisma.project.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { splitters: true } } },
    });

    res.json(
      projects.map(({ _count, ...project }) => ({
        ...project,
        splittersCount: _count.splitters,
      }))
    );
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const name = requireString(req.body?.name, "Nome do projeto", {
      maxLength: 120,
    });

    const project = await prisma.project.create({ data: { name } });
    res.status(201).json(project);
  } catch (error) {
    next(error);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    const id = parseId(req.params.id, "Projeto");
    const name = requireString(req.body?.name, "Nome do projeto", {
      maxLength: 120,
    });

    const existing = await prisma.project.findUnique({ where: { id } });
    if (!existing) throw notFound("Projeto não encontrado");

    res.json(await prisma.project.update({ where: { id }, data: { name } }));
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const id = parseId(req.params.id, "Projeto");

    const existing = await prisma.project.findUnique({ where: { id } });
    if (!existing) throw notFound("Projeto não encontrado");

    // Splitters, links, abas e rotas caem junto (onDelete: Cascade).
    await prisma.project.delete({ where: { id } });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
