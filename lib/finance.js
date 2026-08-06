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
//
// `renegociada` = parcela substituída por um acordo (o valor dela virou as
// parcelas novas do acordo) — nunca é atrasada, mesmo com dueDate no passado
// e paid=false, porque não é mais uma dívida de verdade, é um registro morto.
// Cada chamador tinha que lembrar de excluir isso na mão, e a maioria (fila
// de cobrança, alertas críticos, vários relatórios) esquecia — cliente que
// fez acordo continuava contando como atrasado nos dias vencidos do plano
// antigo. Centralizar aqui corrige todos os lugares de uma vez.
export function parcelaAtrasada(parcela, hoje = hojeStr(), opts = {}) {
  if (parcela.paid || parcela.renegociada) return false;
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

// Quanto ainda falta receber de uma parcela: o valor dela menos o que já
// entrou em baixas PARCIAIS. Sem descontar isso, quem pagou R$ 90 de uma
// parcela de R$ 100 continuava aparecendo devendo os R$ 100 inteiros — na
// fila de cobrança, nos relatórios e até na mensagem enviada pro cliente.
export function valorEmAberto(parcela) {
  if (parcela.paid) return 0;
  const falta = (parcela.amount || 0) - (parcela.valorPago || 0);
  return falta > 0 ? Math.round(falta * 100) / 100 : 0;
}

// Quanto de fato entrou numa parcela já baixada. `amountPago` só é preenchido
// quando o cobrador digita um valor diferente; nas baixas antigas (e nas que
// vieram por outros caminhos) ele é null e o valor real é o `amount`. Somar
// só `amountPago` fazia o recebido aparecer como zero.
export function valorRecebidoDe(parcela) {
  if (!parcela.paid) return parcela.valorPago || 0;
  return parcela.amountPago != null ? parcela.amountPago : parcela.amount || 0;
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

// Próximo dia útil de cobrança: nunca cai domingo (não tem cobrança nesse dia).
function proximoDiaCobranca(date) {
  let d = addDays(date, 1);
  if (d.getUTCDay() === 0) d = addDays(d, 1); // domingo -> pula pra segunda
  return d;
}

// Gera as 10 parcelas diárias (de segunda a sábado — nunca domingo). A 1ª
// cobrança é SEMPRE no dia seguinte ao pagamento de capital; as demais, dia
// após dia, pulando qualquer domingo no meio do caminho.
export function gerarParcelas(valorCapital, honorariosPct, pagamentoCapital) {
  if (!pagamentoCapital) return [];
  const { valorParcela } = resumoCobranca(valorCapital, honorariosPct);
  let cursor = new Date(pagamentoCapital);
  const parcelas = [];
  for (let i = 0; i < NUM_PARCELAS; i++) {
    cursor = proximoDiaCobranca(cursor);
    parcelas.push({ number: i + 1, dueDate: cursor, amount: valorParcela });
  }
  return parcelas;
}
