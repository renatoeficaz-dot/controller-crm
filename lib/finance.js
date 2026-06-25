// Regras de cálculo da cobrança.
export const NUM_PARCELAS = 10;

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
