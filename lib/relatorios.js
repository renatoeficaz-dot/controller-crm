// Cálculos dos relatórios financeiros (Fase 1).
// Trabalham sobre o array de "stages" (cada stage com .contacts, cada contact com .parcelas).
import { NUM_PARCELAS, hojeStr, dueStr, valorParcelaAtual, valorEmAberto, valorRecebidoDe } from "@/lib/finance";

const fmt = (d) => d.toLocaleDateString("en-CA"); // Date -> "YYYY-MM-DD" local

// Fim da semana corrente (domingo), como "YYYY-MM-DD"
export function fimSemanaStr() {
  const d = new Date();
  const dowSegBase = (d.getDay() + 6) % 7; // 0 = segunda ... 6 = domingo
  d.setDate(d.getDate() + (6 - dowSegBase));
  return fmt(d);
}

// Fim do mês corrente, como "YYYY-MM-DD"
export function fimMesStr() {
  const d = new Date();
  return fmt(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

// Todas as parcelas de todos os contatos (com o contato anexado)
function todasParcelas(stages) {
  const out = [];
  for (const s of stages) {
    for (const c of s.contacts || []) {
      for (const p of c.parcelas || []) out.push({ ...p, _contact: c, _stage: s.name });
    }
  }
  return out;
}

// A receber do dia / semana / mês (parcelas em aberto vencendo de hoje até o fim do período).
// Não inclui as já vencidas (essas entram em Inadimplência).
export function aReceber(stages, opts = {}) {
  const hoje = hojeStr();
  const fimSemana = fimSemanaStr();
  const fimMes = fimMesStr();
  const parcelas = todasParcelas(stages).filter((p) => !p.paid && !p.renegociada);
  const soma = (ate) =>
    parcelas
      .filter((p) => {
        const d = dueStr(p);
        return d >= hoje && d <= ate;
      })
      .reduce((acc, p) => acc + valorParcelaAtual(p, hoje, opts), 0);
  return { dia: soma(hoje), semana: soma(fimSemana), mes: soma(fimMes) };
}

// Total recebido num intervalo [inicio, fim] (datas "YYYY-MM-DD", inclusivas), pelo paidAt.
export function totalRecebido(stages, inicio, fim) {
  return todasParcelas(stages)
    .filter((p) => {
      // Baixa completa usa paidAt; baixa PARCIAL (paid=false, valorPago>0)
      // usa valorPagoEm — sem isso o dinheiro do parcial entrava no caixa
      // mas nunca aparecia no "Total recebido".
      const quando = p.paid ? p.paidAt : p.valorPago > 0 ? p.valorPagoEm : null;
      if (!quando) return false;
      const d = fmt(new Date(quando));
      return d >= inicio && d <= fim;
    })
    .reduce((acc, p) => acc + valorRecebidoDe(p), 0);
}

// O que estava PLANEJADO vencer num período [inicio, fim] (datas "YYYY-MM-DD",
// inclusivas) — soma do valor base das parcelas (sem multa) pelo vencimento,
// não pelo pagamento. Serve pra comparar com totalRecebido() do mesmo período
// e ver se o que entrou cobriu o que era esperado — parcelas pagas antes ou
// depois do prazo original ainda contam aqui pelo vencimento, não pelo pagamento.
export function planejadoNoPeriodo(stages, inicio, fim) {
  return todasParcelas(stages)
    .filter((p) => !p.renegociada)
    .filter((p) => {
      const d = dueStr(p);
      return d >= inicio && d <= fim;
    })
    .reduce((acc, p) => acc + p.amount, 0);
}

// Capital liberado (emprestado) num período [inicio, fim], pelo dia em que
// pagamentoCapital foi definido — mesmo critério usado no "Giro de capital".
export function liberadoNoPeriodo(stages, inicio, fim) {
  let total = 0;
  for (const s of stages) {
    for (const c of s.contacts || []) {
      if (!c.valorCapital || !c.pagamentoCapital) continue;
      const d = String(c.pagamentoCapital).slice(0, 10);
      if (d >= inicio && d <= fim) total += c.valorCapital;
    }
  }
  return total;
}

// Inadimplência das leads em "Cravo": pendente em capital e pendente total (com honorários + multa).
export function inadimplenciaCravo(stages) {
  const cravo = stages.find((s) => s.name === "Cravo");
  let pendenteCapital = 0;
  let pendenteTotal = 0;
  let clientes = 0;
  for (const c of cravo?.contacts || []) {
    const parcelas = c.parcelas || [];
    const emAberto = parcelas.filter((p) => !p.paid && !p.renegociada);
    if (emAberto.length === 0) continue;
    clientes += 1;
    // Capital pendente = fatia do capital ainda não quitada (cada parcela quita capital/10)
    pendenteCapital += (Number(c.valorCapital) || 0) * (emAberto.length / NUM_PARCELAS);
    // Total pendente = soma das parcelas em aberto (capital + honorários, SEM multa)
    pendenteTotal += emAberto.reduce((acc, p) => acc + valorEmAberto(p), 0);
  }
  return { pendenteCapital, pendenteTotal, clientes };
}
