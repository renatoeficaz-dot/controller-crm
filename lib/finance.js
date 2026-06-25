// Regras de cálculo da cobrança.
export const NUM_PARCELAS = 10;

// Multa por atraso: parcela vencida e não paga vale 50% a mais (uma vez só).
export const MULTA_PCT = 0.5;

// "YYYY-MM-DD" (local) de hoje
export function hojeStr() {
  return new Date().toLocaleDateString("en-CA");
}

// dueDate (gravada em UTC) -> "YYYY-MM-DD"
export function dueStr(parcela) {
  return new Date(parcela.dueDate).toISOString().slice(0, 10);
}

// Parcela vencida e ainda não paga?
export function parcelaAtrasada(parcela, hoje = hojeStr()) {
  return !parcela.paid && dueStr(parcela) < hoje;
}

// Valor atual da parcela: aplica os 50% de multa se estiver atrasada.
export function valorParcelaAtual(parcela, hoje = hojeStr()) {
  return parcelaAtrasada(parcela, hoje) ? parcela.amount * (1 + MULTA_PCT) : parcela.amount;
}

// Soma N dias a uma data em UTC (evita drift de fuso)
function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

// Calcula o resumo financeiro a partir do capital e do % de honorários
export function resumoCobranca(valorCapital, honorariosPct) {
  const capital = Number(valorCapital || 0);
  const pct = Number(honorariosPct || 0);
  const honorarios = capital * (pct / 100);
  const total = capital + honorarios;
  const valorParcela = total / NUM_PARCELAS;
  return { capital, pct, honorarios, total, valorParcela };
}

// Gera as 10 parcelas diárias. A 1ª cobrança é SEMPRE no dia seguinte
// ao pagamento de capital; as demais, dia após dia.
export function gerarParcelas(valorCapital, honorariosPct, pagamentoCapital) {
  if (!pagamentoCapital) return [];
  const { valorParcela } = resumoCobranca(valorCapital, honorariosPct);
  const base = new Date(pagamentoCapital);
  return Array.from({ length: NUM_PARCELAS }, (_, i) => ({
    number: i + 1,
    dueDate: addDays(base, i + 1), // +1 dia para a 1ª, +2 para a 2ª, ...
    amount: valorParcela,
  }));
}
