import prisma from "../prisma.js";
import { calculateProbabilities } from "../../shared/probability.js";

/**
 * Recalcula a fatia de tráfego de cada link.
 *
 * A distribuição é sempre por grupo (splitter + aba): links de abas
 * diferentes nunca competem entre si, porque cada aba atende rotas
 * diferentes.
 */
export async function optimizeTrafficProbabilities({ splitterId } = {}) {
  const where = splitterId ? { splitterId: Number(splitterId) } : {};
  const links = await prisma.link.findMany({ where });

  const groups = new Map();

  for (const link of links) {
    const key = `${link.splitterId}::${link.tab}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(link);
  }

  const updates = [];

  for (const group of groups.values()) {
    const distributed = calculateProbabilities(group);
    const byId = new Map(distributed.map((link) => [link.id, link.probability]));

    for (const link of group) {
      // Link desativado não participa do sorteio: zera para não confundir a UI.
      const probability = link.disabled ? 0 : byId.get(link.id) ?? 0;

      if (Number(link.probability) === probability) continue;

      updates.push(
        prisma.link.update({
          where: { id: link.id },
          data: { probability },
        })
      );
    }
  }

  if (updates.length > 0) await prisma.$transaction(updates);

  return { groups: groups.size, updated: updates.length };
}
