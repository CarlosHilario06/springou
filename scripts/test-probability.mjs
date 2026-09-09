/**
 * Testes do algoritmo de distribuição de tráfego.
 *
 *   npm test
 *
 * Não precisa de banco nem de servidor: exercita src/shared/probability.js
 * direto. É o núcleo do produto — quem decide para onde vai o dinheiro —
 * então cada comportamento esperado vira um caso aqui.
 */
import {
  calculateProbabilities,
  rebalanceFixedShares,
} from "../src/shared/probability.js";

const soma = (r) => Number(r.reduce((a, l) => a + l.probability, 0).toFixed(2));
const por = (r, url) => r.find((l) => l.url === url)?.probability;
let fails = 0;
const check = (n, ok, extra = "") => { console.log(`${ok ? "✅" : "❌"} ${n} ${extra}`); if (!ok) fails++; };

const L = (url, ecpm, impressions, extra = {}) => ({ id: url, url, ecpm, impressions, disabled: false, ...extra });

console.log("\n[1] Sem trava — comportamento de antes");
let r = calculateProbabilities([L("a", 18, 40000), L("b", 9, 38000), L("c", 2, 31000)]);
check("soma 100%", soma(r) === 100, `(${soma(r)})`);
check("melhor eCPM leva mais", por(r, "a") > por(r, "b") && por(r, "b") > por(r, "c"));

console.log("\n[2] Uma trava de 50% + dois automáticos");
r = calculateProbabilities([L("a", 18, 40000, { fixedProbability: 50 }), L("b", 9, 38000), L("c", 2, 31000)]);
check("travado recebe exatamente 50%", por(r, "a") === 50, `(${por(r, "a")})`);
check("soma 100%", soma(r) === 100, `(${soma(r)})`);
check("os outros dividem os 50% restantes", Math.abs(por(r, "b") + por(r, "c") - 50) < 0.05);
check("entre os livres o melhor ainda leva mais", por(r, "b") > por(r, "c"));
console.log("   ", r.map((l) => `${l.url}=${l.probability}%`).join("  "));

console.log("\n[3] Travas somando mais de 100%");
r = calculateProbabilities([L("a", 5, 1000, { fixedProbability: 80 }), L("b", 5, 1000, { fixedProbability: 60 }), L("c", 5, 1000)]);
check("normaliza para 100%", soma(r) === 100, `(${soma(r)})`);
check("mantém a proporção 80:60", Math.abs(por(r, "a") / por(r, "b") - 80 / 60) < 0.01);
check("automático fica sem tráfego", por(r, "c") === 0);
console.log("   ", r.map((l) => `${l.url}=${l.probability}%`).join("  "));

console.log("\n[4] Todos travados, somando menos de 100%");
r = calculateProbabilities([L("a", 5, 1000, { fixedProbability: 30 }), L("b", 5, 1000, { fixedProbability: 20 })]);
check("preenche até 100% na proporção", soma(r) === 100 && Math.abs(por(r, "a") / por(r, "b") - 1.5) < 0.01, `(${por(r,"a")} / ${por(r,"b")})`);

console.log("\n[5] Trava de 0% — desliga o link sem desativar");
r = calculateProbabilities([L("a", 5, 1000, { fixedProbability: 0 }), L("b", 5, 1000), L("c", 5, 1000)]);
check("travado em 0 não recebe nada", por(r, "a") === 0);
check("soma continua 100%", soma(r) === 100, `(${soma(r)})`);

console.log("\n[6] Link desativado é ignorado mesmo com trava");
r = calculateProbabilities([L("a", 5, 1000, { fixedProbability: 50, disabled: true }), L("b", 5, 1000)]);
check("desativado fora do resultado", r.length === 1 && por(r, "b") === 100);

console.log("\n[7] fixedProbability nulo é tratado como automático");
r = calculateProbabilities([L("a", 18, 40000, { fixedProbability: null }), L("b", 2, 40000, { fixedProbability: undefined })]);
check("soma 100%", soma(r) === 100);
check("continua otimizando pelo eCPM", por(r, "a") > por(r, "b"));

console.log("\n[8] Teto adaptativo — o eCPM volta a importar");
r = calculateProbabilities([L("a", 250, 40000), L("b", 100, 40000)]);
const dois25 = por(r, "a");
r = calculateProbabilities([L("a", 1000, 40000), L("b", 100, 40000)]);
const dois10x = por(r, "a");
r = calculateProbabilities([L("a", 10000, 40000), L("b", 100, 40000)]);
const dois100x = por(r, "a");
check("2 links: diferenças distintas dão fatias distintas",
  dois25 < dois10x && dois10x < dois100x, `(${dois25}% < ${dois10x}% < ${dois100x}%)`);
check("2 links: nenhum passa de 95%", dois100x <= 95.01, `(${dois100x})`);
check("2 links: o perdedor mantém o piso de 5%", 100 - dois100x >= 5, `(${(100-dois100x).toFixed(2)})`);

r = calculateProbabilities([L("a", 1000, 40000), L("b", 100, 40000), L("c", 10, 40000)]);
check("3 links: soma 100% (±0,02 de arredondamento)", Math.abs(soma(r) - 100) <= 0.02, `(${soma(r)})`);
check("3 links: teto de 90% respeitado", por(r, "a") <= 90.01, `(${por(r, "a")})`);

const dez = Array.from({ length: 10 }, (_, i) => L(`l${i}`, 1000 - i * 100, 40000));
r = calculateProbabilities(dez);
check("10 links: volta ao teto de 55%", Math.max(...r.map(l => l.probability)) <= 55.01);
check("10 links: soma 100% (±0,02 de arredondamento)", Math.abs(soma(r) - 100) <= 0.02, `(${soma(r)})`);
check("10 links: ninguém abaixo do piso", Math.min(...r.map(l => l.probability)) >= 5 - 0.01);

console.log("\n[9] Teto adaptativo convive com a trava manual");
r = calculateProbabilities([L("a", 1000, 40000, { fixedProbability: 30 }), L("b", 1000, 40000), L("c", 10, 40000)]);
check("travado mantém os 30%", por(r, "a") === 30);
check("soma 100%", soma(r) === 100, `(${soma(r)})`);
check("entre os livres o melhor leva mais", por(r, "b") > por(r, "c"));

console.log("\n[10] Editar uma fatia numa aba toda travada");
// Caso real: cinco travas somando 100 e o operador troca a primeira por 50%.
// Antes, todas eram reduzidas na proporção e a fatia digitada virava 39,8%.
let linhas = [
  { id: 2, fixedProbability: 24.3 },
  { id: 3, fixedProbability: 20 },
  { id: 4, fixedProbability: 30.5 },
  { id: 5, fixedProbability: 15.5 },
  { id: 6, fixedProbability: 9.7 },
];
let ajuste = rebalanceFixedShares(linhas, 2, "50");
let sobra = Object.values(ajuste).reduce((a, b) => a + b, 0);
check("as outras travas cedem espaço", Math.abs(sobra - 50) < 0.05, `(${sobra.toFixed(1)})`);
check("a fatia digitada não é mexida", ajuste[2] === undefined);
check("proporção entre as outras é mantida", ajuste[4] > ajuste[3] && ajuste[3] > ajuste[5]);

r = calculateProbabilities(
  linhas.map((l) => ({ ...l, url: `u${l.id}`, ecpm: 10, impressions: 40000, disabled: false, fixedProbability: l.id === 2 ? 50 : ajuste[l.id] }))
);
check("depois de salvar, a fatia digitada é exatamente 50%", por(r, "u2") === 50, `(${por(r, "u2")})`);
check("soma 100%", Math.abs(soma(r) - 100) <= 0.02, `(${soma(r)})`);

console.log("\n[11] Com link automático na aba, as travas não se mexem à toa");
ajuste = rebalanceFixedShares(
  [{ id: 1, fixedProbability: 30 }, { id: 2, fixedProbability: 20 }, { id: 3 }],
  1,
  "40"
);
check("cabe em 100%: nada muda", Object.keys(ajuste).length === 0);

ajuste = rebalanceFixedShares(
  [{ id: 1, fixedProbability: 30 }, { id: 2, fixedProbability: 80 }, { id: 3 }],
  1,
  "40"
);
check("não cabe: a outra trava é reduzida", ajuste[2] === 60, `(${ajuste[2]})`);

console.log("\n[12] Campo apagado volta ao automático sem mexer nos outros");
ajuste = rebalanceFixedShares([{ id: 1, fixedProbability: 30 }, { id: 2, fixedProbability: 20 }], 1, "");
check("nada a ajustar", Object.keys(ajuste).length === 0);

process.exit(fails ? 1 : 0);
