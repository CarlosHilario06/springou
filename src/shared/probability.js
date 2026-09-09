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
  /**
   * Teto de participação por link, aplicado só quando há links suficientes
   * para ele fazer sentido — ver `ceilingFor`.
   */
  maxProb: 0.55,
  /** Impressões a partir das quais o eCPM é considerado confiável. */
  minImpressions: 1000,
  /** eCPM mínimo considerado, evita score zerado. */
  minEcpm: 0.01,
};

/**
 * Teto que acompanha a quantidade de links.
 *
 * Um teto fixo achata a distribuição quando há poucos links: com dois, o
 * limite de 55% faz uma diferença de eCPM de 2x e outra de 10.000x darem o
 * mesmo 55/45 — o eCPM deixa de importar. O espaço realmente necessário é
 * o piso dos outros links, então o teto é o que sobra depois de reservá-lo.
 */
function ceilingFor(totalLinks, config) {
  const roomForOthers = 1 - (totalLinks - 1) * config.minProb;
  return Math.min(1, Math.max(config.maxProb, roomForOthers));
}

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

  probs = clampToBounds(probs, config.minProb, ceilingFor(totalLinks, config));

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

/** Arredonda para uma casa — a mesma precisão que o painel mostra. */
function round1(value) {
  return Math.round(value * 10) / 10;
}

/**
 * Recalcula as outras travas quando uma fatia é editada à mão.
 *
 * A fatia que acabou de ser digitada vale exatamente o que foi digitado —
 * quem cede (ou toma) espaço são as demais travas, na proporção em que já
 * estavam. Enquanto houver link automático na aba, ele é que absorve a
 * sobra: as outras travas só se mexem se não couberem mais em 100%.
 *
 * @param {Array} rows linhas visíveis da aba, com `id` e `fixedProbability`
 * @param {number} editedId id da linha que está sendo digitada
 * @param {string|number} rawValue valor digitado
 * @returns {Object} novas travas por id, só para as linhas que mudaram
 */
export function rebalanceFixedShares(rows, editedId, rawValue) {
  const value = readFixedShare({ fixedProbability: rawValue });
  if (value === null) return {};

  const others = (rows || []).filter(
    (row) => row.id !== undefined && row.id !== editedId && !row.disabled
  );

  const locked = others.filter((row) => readFixedShare(row) !== null);
  if (locked.length === 0) return {};

  const budget = Math.max(0, 100 - value);
  const total = locked.reduce((acc, row) => acc + readFixedShare(row), 0);

  // Ainda há link automático para absorver a sobra e as travas cabem: nada
  // a mexer.
  if (locked.length < others.length && total <= budget) return {};

  const shares = locked.map((row) =>
    total > 0 ? (readFixedShare(row) * budget) / total : budget / locked.length
  );

  const rounded = shares.map(round1);

  // O arredondamento deixa um resto de no máximo alguns décimos; joga tudo
  // na maior fatia, onde ele desaparece.
  const drift = round1(budget - rounded.reduce((acc, share) => acc + share, 0));

  if (drift !== 0) {
    let biggest = 0;
    for (let i = 1; i < rounded.length; i += 1) {
      if (rounded[i] > rounded[biggest]) biggest = i;
    }
    rounded[biggest] = Math.max(0, round1(rounded[biggest] + drift));
  }

  const changes = {};
  locked.forEach((row, index) => {
    changes[row.id] = rounded[index];
  });

  return changes;
}
