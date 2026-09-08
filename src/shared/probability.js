/**
 * Algoritmo de distribuição de tráfego entre os links de uma aba.
 *
 * A ideia: mandar mais tráfego para quem rende mais (eCPM), sem nunca parar
 * de testar os outros. Três mecanismos garantem isso:
 *
 * 1. `alpha` achata a vantagem do melhor link. Com alpha = 0.6, um link que
 *    rende o dobro não recebe o dobro do tráfego, recebe ~1.5x. Evita que um
 *    pico momentâneo mate todos os concorrentes.
 * 2. `confidence` corta o peso de links com poucas impressões. Um eCPM alto
 *    medido em 20 impressões não é confiável e não deve dominar o sorteio.
 * 3. `epsilon` + `minProb` reservam uma fatia fixa para exploração, então
 *    link novo (ou momentaneamente ruim) sempre recebe tráfego suficiente
 *    para ser reavaliado.
 */

export const DEFAULT_OPTIONS = {
  /** Achatamento da curva de eCPM. Menor = distribuição mais uniforme. */
  alpha: 0.6,
  /** Fatia reservada à exploração uniforme (0.1 = 10%). */
  epsilon: 0.1,
  /** Piso de participação por link. */
  minProb: 0.05,
  /** Teto de participação por link. */
  maxProb: 0.55,
  /** Impressões a partir das quais o eCPM é considerado confiável. */
  minImpressions: 1000,
  /** eCPM mínimo considerado, evita score zerado. */
  minEcpm: 0.01,
};

/**
 * Aplica piso e teto mantendo a soma em 1.
 *
 * Clampar e simplesmente renormalizar quebra os limites de novo, então o
 * excesso é redistribuído só entre os itens que ainda têm folga, repetindo
 * até estabilizar.
 */
function clampToBounds(probs, minProb, maxProb) {
  const total = probs.length;

  if (total === 0) return [];

  // Limites impossíveis de satisfazer (ex.: piso de 5% com 30 links).
  if (minProb * total > 1 || maxProb * total < 1) {
    return probs.map(() => 1 / total);
  }

  let current = [...probs];

  for (let iteration = 0; iteration < 50; iteration += 1) {
    const clamped = current.map((prob) =>
      Math.min(Math.max(prob, minProb), maxProb)
    );

    const sum = clamped.reduce((acc, prob) => acc + prob, 0);
    const diff = 1 - sum;

    if (Math.abs(diff) < 1e-9) return clamped;

    // Quem ainda pode absorver a diferença sem estourar o limite oposto.
    const adjustable = [];

    for (let index = 0; index < total; index += 1) {
      const hasRoomUp = clamped[index] < maxProb - 1e-12;
      const hasRoomDown = clamped[index] > minProb + 1e-12;

      if (diff > 0 ? hasRoomUp : hasRoomDown) adjustable.push(index);
    }

    if (adjustable.length === 0) return clamped;

    const share = diff / adjustable.length;

    current = clamped.slice();
    for (const index of adjustable) current[index] += share;
  }

  const sum = current.reduce((acc, prob) => acc + prob, 0);
  return sum > 0 ? current.map((prob) => prob / sum) : probs;
}

/**
 * Recebe os links de uma aba e devolve cada um com sua fatia de tráfego.
 *
 * @returns {Array} links ativos com `prob` (0-1) e `probability` (0-100).
 */
export function calculateProbabilities(links, options = {}) {
  const config = { ...DEFAULT_OPTIONS, ...options };

  const activeLinks = (links || []).filter((link) => !link.disabled);
  const totalLinks = activeLinks.length;

  if (totalLinks === 0) return [];

  if (totalLinks === 1) {
    return [{ ...activeLinks[0], prob: 1, probability: 100 }];
  }

  const scoredLinks = activeLinks.map((link) => {
    const ecpm = Math.max(Number(link.ecpm) || 0, config.minEcpm);
    const impressions = Math.max(Number(link.impressions) || 0, 0);

    const confidence = Math.min(impressions / config.minImpressions, 1);
    const score = Math.pow(ecpm, config.alpha) * confidence;

    return {
      ...link,
      ecpmValue: ecpm,
      impressions,
      confidence,
      score: Math.max(score, 0.01),
    };
  });

  const totalScore = scoredLinks.reduce((acc, link) => acc + link.score, 0);

  let probs = scoredLinks.map((link) => link.score / totalScore);

  // Mistura com a distribuição uniforme: a fatia de exploração.
  probs = probs.map(
    (prob) => (1 - config.epsilon) * prob + config.epsilon / totalLinks
  );

  probs = clampToBounds(probs, config.minProb, config.maxProb);

  return scoredLinks.map((link, index) => ({
    ...link,
    prob: probs[index],
    probability: Number((probs[index] * 100).toFixed(2)),
  }));
}

/**
 * Sorteio ponderado. `probability` é só um peso relativo — se estiver
 * zerado (links ainda não otimizados), cai para sorteio uniforme.
 */
export function pickByProbability(links) {
  if (!links || links.length === 0) return null;

  const totalWeight = links.reduce(
    (acc, link) => acc + Math.max(Number(link.probability) || 0, 0),
    0
  );

  if (totalWeight <= 0) {
    return links[Math.floor(Math.random() * links.length)];
  }

  const target = Math.random() * totalWeight;
  let accumulated = 0;

  for (const link of links) {
    accumulated += Math.max(Number(link.probability) || 0, 0);
    if (target < accumulated) return link;
  }

  return links[links.length - 1];
}
