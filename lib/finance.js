// Regras de cálculo da cobrança.
export const NUM_PARCELAS = 10;

// % de multa por atraso usado quando a config não define outro valor.
export const MULTA_PCT_PADRAO = 50;

// "YYYY-MM-DD" (local) de hoje
export function hojeStr() {
  return new Date().toLocaleDateString("en-CA");
}

// "HH:MM" (local) de agora — usado para o horário limite de pagamento.
export function horaStr(d = new Date()) {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

// dueDate (gravada em UTC) -> "YYYY-MM-DD"
export function dueStr(parcela) {
  return new Date(parcela.dueDate).toISOString().slice(0, 10);
}

// Parcela vencida e ainda não paga?
// opts.horaLimite ("HH:MM"): se a parcela vence HOJE e já passou desse horário,
// também conta como atrasada (opts.agora permite fixar o "agora" nos testes).
export function parcelaAtrasada(parcela, hoje = hojeStr(), opts = {}) {
  if (parcela.paid) return false;
  const due = dueStr(parcela);
  if (due < hoje) return true;
  const limite = (opts.horaLimite || "").trim();
  if (due === hoje && limite) {
    return (opts.agora || horaStr()) >= limite;
  }
  return false;
}

// Valor atual da parcela: aplica a multa por atraso se estiver atrasada.
// opts.multaPct (em %, ex.: 50) sobrescreve o padrão.
export function valorParcelaAtual(parcela, hoje = hojeStr(), opts = {}) {
  const pctNum = opts.multaPct != null && opts.multaPct !== "" ? Number(opts.multaPct) : MULTA_PCT_PADRAO;
  return parcelaAtrasada(parcela, hoje, opts) ? parcela.amount * (1 + pctNum / 100) : parcela.amount;
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
