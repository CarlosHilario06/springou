import { Router } from "express";
import prisma from "../prisma.js";
import {
  conflict,
  notFound,
  optionalString,
  parseId,
  requireString,
} from "../lib/http.js";

const router = Router();

router.get("/projects/:projectId/splitters", async (req, res, next) => {
  try {
    const projectId = parseId(req.params.projectId, "Projeto");

    const splitters = await prisma.splitter.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      include: {
        tabs: { orderBy: { tab: "asc" } },
        _count: { select: { links: true, routes: true } },
      },
    });

    res.json(
      splitters.map(({ _count, ...splitter }) => ({
        ...splitter,
        linksCount: _count.links,
        routesCount: _count.routes,
      }))
    );
  } catch (error) {
    next(error);
  }
});

router.post("/projects/:projectId/splitters", async (req, res, next) => {
  try {
    const projectId = parseId(req.params.projectId, "Projeto");
    const category = requireString(req.body?.category, "Categoria", {
      maxLength: 120,
    });
    const location = optionalString(req.body?.location, { maxLength: 120 });

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw notFound("Projeto não encontrado");

    // Todo splitter nasce com a aba "1" para já poder receber links.
    const splitter = await prisma.splitter.create({
      data: {
        projectId,
        category,
        location,
        tabs: { create: [{ tab: "1" }] },
      },
      include: { tabs: true },
    });

    res.status(201).json(splitter);
  } catch (error) {
    next(error);
  }
});

router.put("/splitters/:id", async (req, res, next) => {
  try {
    const id = parseId(req.params.id, "Splitter");

    const existing = await prisma.splitter.findUnique({ where: { id } });
    if (!existing) throw notFound("Splitter não encontrado");

    const splitter = await prisma.splitter.update({
      where: { id },
      data: {
        category: requireString(req.body?.category, "Categoria", {
          maxLength: 120,
        }),
        location: optionalString(req.body?.location, { maxLength: 120 }),
      },
    });

    res.json(splitter);
  } catch (error) {
    next(error);
  }
});

router.delete("/splitters/:id", async (req, res, next) => {
  try {
    const id = parseId(req.params.id, "Splitter");

    const existing = await prisma.splitter.findUnique({ where: { id } });
    if (!existing) throw notFound("Splitter não encontrado");

    await prisma.splitter.delete({ where: { id } });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

/* ---------------------------------------------------------------- abas */

router.get("/splitters/:splitterId/tabs", async (req, res, next) => {
  try {
    const splitterId = parseId(req.params.splitterId, "Splitter");

    res.json(
      await prisma.splitterTab.findMany({
        where: { splitterId },
        orderBy: { tab: "asc" },
      })
    );
  } catch (error) {
    next(error);
  }
});

router.post("/splitters/:splitterId/tabs", async (req, res, next) => {
  try {
    const splitterId = parseId(req.params.splitterId, "Splitter");
    const tab = requireString(req.body?.tab, "Nome da aba", { maxLength: 60 });

    const splitter = await prisma.splitter.findUnique({
      where: { id: splitterId },
    });
    if (!splitter) throw notFound("Splitter não encontrado");

    const duplicate = await prisma.splitterTab.findUnique({
      where: { splitterId_tab: { splitterId, tab } },
    });
    if (duplicate) throw conflict("Já existe uma aba com esse nome");

    res.status(201).json(
      await prisma.splitterTab.create({ data: { splitterId, tab } })
    );
  } catch (error) {
    next(error);
  }
});

router.put("/splitters/:splitterId/tabs/:oldTab", async (req, res, next) => {
  try {
    const splitterId = parseId(req.params.splitterId, "Splitter");
    const oldTab = String(req.params.oldTab);
    const newTab = requireString(req.body?.tab, "Nome da aba", {
      maxLength: 60,
    });

    const existing = await prisma.splitterTab.findUnique({
      where: { splitterId_tab: { splitterId, tab: oldTab } },
    });
    if (!existing) throw notFound("Aba não encontrada");

    if (oldTab === newTab) return res.json(existing);

    const duplicate = await prisma.splitterTab.findUnique({
      where: { splitterId_tab: { splitterId, tab: newTab } },
    });
    if (duplicate) throw conflict("Já existe uma aba com esse nome");

    // Aba, links e rotas se referenciam pelo nome: renomear os três junto,
    // ou a aba perde seus links e as rotas apontam para o vazio.
    const [tab] = await prisma.$transaction([
      prisma.splitterTab.update({
        where: { splitterId_tab: { splitterId, tab: oldTab } },
        data: { tab: newTab },
      }),
      prisma.link.updateMany({
        where: { splitterId, tab: oldTab },
        data: { tab: newTab },
      }),
      prisma.splitterRoute.updateMany({
        where: { splitterId, tab: oldTab },
        data: { tab: newTab },
      }),
    ]);

    res.json(tab);
  } catch (error) {
    next(error);
  }
});

router.delete("/splitters/:splitterId/tabs/:tab", async (req, res, next) => {
  try {
    const splitterId = parseId(req.params.splitterId, "Splitter");
    const tab = String(req.params.tab);

    const existing = await prisma.splitterTab.findUnique({
      where: { splitterId_tab: { splitterId, tab } },
    });
    if (!existing) throw notFound("Aba não encontrada");

    const tabCount = await prisma.splitterTab.count({ where: { splitterId } });
    if (tabCount <= 1) throw conflict("O splitter precisa de ao menos uma aba");

    const routeCount = await prisma.splitterRoute.count({
      where: { splitterId, tab },
    });
    if (routeCount > 0) {
      throw conflict(
        `Existem ${routeCount} rota(s) apontando para esta aba. Remova-as antes.`
      );
    }

    await prisma.$transaction([
      prisma.link.deleteMany({ where: { splitterId, tab } }),
      prisma.splitterTab.delete({
        where: { splitterId_tab: { splitterId, tab } },
      }),
    ]);

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
