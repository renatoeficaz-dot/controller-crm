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

// Segunda-feira (YYYY-MM-DD) da semana de trabalho (seg-sáb) de um dia dado —
// domingo é folga e não pertence a nenhuma semana de comissão, por isso
// devolve null pra ele. Mesma regra de lib/comissao.js, reimplementada aqui
// pra não puxar Prisma pro cliente (esse arquivo roda no navegador).
function chaveSemanaTrabalho(diaStr) {
  const d = new Date(diaStr + "T00:00:00.000Z");
  const dow = d.getUTCDay(); // 0 = domingo
  if (dow === 0) return null;
  d.setUTCDate(d.getUTCDate() - (dow - 1));
  return d.toISOString().slice(0, 10);
}

// Estimativa do custo de comissão no período [inicio, fim], baseada só na
// métrica "recuperação" (a principal — bônus por bater meta diária/semanal de
// valor recebido) usando a config GLOBAL de comissão. NÃO reproduz o motor
// inteiro de lib/comissao.js: ignora metas específicas por colaborador, as
// métricas de análise/recebimento/juros/cravo, o bônus progressivo e o
// desconto por perda — é uma estimativa de "quanto custaria bater a meta",
// não o fechamento oficial da semana (esse continua em Configurações > Comissão).
export function custoComissaoEstimado(stages, inicio, fim, comissaoCfg) {
  if (!comissaoCfg || (!comissaoCfg.metaDiariaValor && !comissaoCfg.metaSemanalValor)) {
    return { total: 0, diario: 0, semanal: 0 };
  }
  const porCobradorDia = new Map(); // "nome|dia" -> valor recuperado
  for (const s of stages) {
    for (const c of s.contacts || []) {
      for (const p of c.parcelas || []) {
        if (!p.baixadoPor) continue;
        const quando = p.paid ? p.paidAt : p.valorPago > 0 ? p.valorPagoEm : null;
        if (!quando) continue;
        const dia = fmt(new Date(quando));
        if (dia < inicio || dia > fim) continue;
        const chave = `${p.baixadoPor}|${dia}`;
        porCobradorDia.set(chave, (porCobradorDia.get(chave) || 0) + valorRecebidoDe(p));
      }
    }
  }
  let diario = 0;
  const porCobradorSemana = new Map();
  for (const [chave, valor] of porCobradorDia) {
    const [nome, dia] = chave.split("|");
    if (comissaoCfg.metaDiariaValor > 0 && valor >= comissaoCfg.metaDiariaValor) diario += comissaoCfg.bonusDiario;
    const semanaKey = chaveSemanaTrabalho(dia);
    if (semanaKey) {
      const k2 = `${nome}|${semanaKey}`;
      porCobradorSemana.set(k2, (porCobradorSemana.get(k2) || 0) + valor);
    }
  }
  let semanal = 0;
  for (const valor of porCobradorSemana.values()) {
    if (comissaoCfg.metaSemanalValor > 0 && valor >= comissaoCfg.metaSemanalValor) semanal += comissaoCfg.bonusSemanal;
  }
  return { total: diario + semanal, diario, semanal };
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
