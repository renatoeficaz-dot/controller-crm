// Cálculos dos relatórios financeiros (Fase 1).
// Trabalham sobre o array de "stages" (cada stage com .contacts, cada contact com .parcelas).
import { NUM_PARCELAS, hojeStr, dueStr, valorParcelaAtual } from "@/lib/finance";

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
  const parcelas = todasParcelas(stages).filter((p) => !p.paid);
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
      if (!p.paid || !p.paidAt) return false;
      const d = fmt(new Date(p.paidAt));
      return d >= inicio && d <= fim;
    })
    .reduce((acc, p) => acc + p.amount, 0);
}

// Inadimplência das leads em "Cravo": pendente em capital e pendente total (com honorários + multa).
export function inadimplenciaCravo(stages) {
  const cravo = stages.find((s) => s.name === "Cravo");
  let pendenteCapital = 0;
  let pendenteTotal = 0;
  let clientes = 0;
  for (const c of cravo?.contacts || []) {
    const parcelas = c.parcelas || [];
    const emAberto = parcelas.filter((p) => !p.paid);
    if (emAberto.length === 0) continue;
    clientes += 1;
    // Capital pendente = fatia do capital ainda não quitada (cada parcela quita capital/10)
    pendenteCapital += (Number(c.valorCapital) || 0) * (emAberto.length / NUM_PARCELAS);
    // Total pendente = soma das parcelas em aberto (capital + honorários, SEM multa)
    pendenteTotal += emAberto.reduce((acc, p) => acc + p.amount, 0);
  }
  return { pendenteCapital, pendenteTotal, clientes };
}
