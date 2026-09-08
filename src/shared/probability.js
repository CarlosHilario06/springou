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

/** Anota um link que não passou pelo cálculo, para a saída ficar uniforme. */
function asFixed(link, share) {
  return {
    ...link,
    ecpmValue: Math.max(Number(link.ecpm) || 0, DEFAULT_OPTIONS.minEcpm),
    impressions: Math.max(Number(link.impressions) || 0, 0),
    confidence: 1,
    score: 0,
    prob: share / 100,
    probability: Number(share.toFixed(2)),
  };
}

/**
 * Distribui `budget` por cento entre os links, pelo eCPM.
 *
 * @returns {Array} links com `prob` (0-1) e `probability` (0-100).
 */
function distribute(activeLinks, config, budget) {
  const totalLinks = activeLinks.length;

  if (totalLinks === 0) return [];

  if (totalLinks === 1) {
    return [
      {
        ...activeLinks[0],
        ecpmValue: Math.max(Number(activeLinks[0].ecpm) || 0, config.minEcpm),
        impressions: Math.max(Number(activeLinks[0].impressions) || 0, 0),
        confidence: 1,
        score: 0,
        prob: budget / 100,
        probability: Number(budget.toFixed(2)),
      },
    ];
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
    prob: (probs[index] * budget) / 100,
    probability: Number((probs[index] * budget).toFixed(2)),
  }));
}

/** Lê a trava manual do link, ou null quando ele é automático. */
function readFixedShare(link) {
  const raw = link.fixedProbability;

  // Ausência precisa ser testada antes do Number(): `Number(null)` é 0, e
  // isso transformaria todo link automático numa trava de 0%.
  if (raw === null || raw === undefined || raw === "") return null;

  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return null;

  return Math.min(value, 100);
}

/**
 * Recebe os links de uma aba e devolve cada um com sua fatia de tráfego.
 *
 * Links com trava manual recebem exatamente a fatia pedida; o que sobra até
 * 100% é distribuído pelo algoritmo entre os demais.
 *
 * @returns {Array} links ativos com `prob` (0-1) e `probability` (0-100).
 */
export function calculateProbabilities(links, options = {}) {
  const config = { ...DEFAULT_OPTIONS, ...options };

  const activeLinks = (links || []).filter((link) => !link.disabled);

  if (activeLinks.length === 0) return [];

  const fixed = [];
  const free = [];

  for (const link of activeLinks) {
    const share = readFixedShare(link);
    if (share === null) free.push(link);
    else fixed.push({ link, share });
  }

  if (fixed.length === 0) return distribute(free, config, 100);

  const fixedTotal = fixed.reduce((acc, item) => acc + item.share, 0);

  // As travas já ocupam tudo (ou passam disso): reparte 100% entre elas na
  // proporção pedida e os automáticos ficam sem tráfego.
  if (fixedTotal >= 100 || free.length === 0) {
    const scale = fixedTotal > 0 ? 100 / fixedTotal : 0;

    return [
      ...fixed.map((item) => asFixed(item.link, item.share * scale)),
      ...free.map((link) => asFixed(link, 0)),
    ];
  }

  return [
    ...fixed.map((item) => asFixed(item.link, item.share)),
    ...distribute(free, config, 100 - fixedTotal),
  ];
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
