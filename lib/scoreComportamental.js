// Score comportamental: mede como o cliente paga NA SUA carteira, ao contrário
// do score da puxada (lib/scoreCredito.js), que vem de bureau externo. Os dois
// se complementam — um diz o passado dele no mercado, este diz o passado com
// você, que costuma prever melhor o próximo empréstimo.
//
// Pesos calibráveis: conforme o relatório "comportamento por ciclo" mostrar o
// padrão real da carteira, vale ajustar.

const PESOS = {
  porParcelaEmDia: 2,
  maxEmDia: 30,
  porParcelaAtrasada: 3, // paga, mas com mais de 3 dias de atraso
  maxAtrasada: 15,
  porParcelaVencida: 10, // vencida e ainda não paga
  maxVencida: 30,
  cicloQuitado: 10,
  porCicloExtra: 5,
  maxCiclosExtras: 15,
};

const TOLERANCIA_DIAS = 3; // atraso até aqui não penaliza (banco cai no dia seguinte, etc.)

function diaStr(v) {
  return String(v).slice(0, 10);
}

export function calcularScoreComportamental(contact, hoje = new Date().toLocaleDateString("en-CA")) {
  const parcelas = contact?.parcelas || [];
  const motivos = [];

  // Sem histórico não dá pra afirmar nada — devolve null em vez de fingir 50.
  if (!parcelas.length) return { score: null, motivos: [] };

  let score = 50; // neutro

  const pagas = parcelas.filter((p) => p.paid && p.paidAt);
  let emDia = 0;
  let atrasadas = 0;
  for (const p of pagas) {
    const dias = Math.round((new Date(diaStr(p.paidAt)) - new Date(diaStr(p.dueDate))) / 86400000);
    if (dias <= TOLERANCIA_DIAS) emDia++;
    else atrasadas++;
  }

  if (emDia > 0) {
    const ganho = Math.min(emDia * PESOS.porParcelaEmDia, PESOS.maxEmDia);
    score += ganho;
    motivos.push(`${emDia} parcela(s) paga(s) em dia`);
  }
  if (atrasadas > 0) {
    const perda = Math.min(atrasadas * PESOS.porParcelaAtrasada, PESOS.maxAtrasada);
    score -= perda;
    motivos.push(`${atrasadas} parcela(s) paga(s) com atraso`);
  }

  const vencidas = parcelas.filter((p) => !p.paid && diaStr(p.dueDate) < hoje).length;
  if (vencidas > 0) {
    const perda = Math.min(vencidas * PESOS.porParcelaVencida, PESOS.maxVencida);
    score -= perda;
    motivos.push(`${vencidas} parcela(s) vencida(s) em aberto`);
  }

  // Ciclo quitado = todas as parcelas daquele ciclo pagas. Cliente que já
  // fechou um empréstimo inteiro é outro patamar de risco.
  const porCiclo = new Map();
  for (const p of parcelas) {
    const c = p.ciclo || 1;
    if (!porCiclo.has(c)) porCiclo.set(c, []);
    porCiclo.get(c).push(p);
  }
  const ciclosQuitados = Array.from(porCiclo.values()).filter((ps) => ps.every((p) => p.paid)).length;
  if (ciclosQuitados > 0) {
    score += PESOS.cicloQuitado;
    motivos.push(`${ciclosQuitados} ciclo(s) quitado(s) por completo`);
    const extras = Math.min((ciclosQuitados - 1) * PESOS.porCicloExtra, PESOS.maxCiclosExtras);
    if (extras > 0) score += extras;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  if (!motivos.length) motivos.push("Sem eventos relevantes no histórico");
  return { score, motivos };
}

export function faixaComportamental(score) {
  if (score == null) return null;
  if (score >= 70) return "bom";
  if (score >= 45) return "regular";
  return "ruim";
}

export const FAIXA_COMPORT_LABEL = {
  bom: "Bom pagador",
  regular: "Pagador irregular",
  ruim: "Histórico ruim",
};
