// Contas dos gráficos do painel de Relatórios (components/GraficosPainel.jsx, rota /api/relatorios/graficos). Funções puras sobre linhas já
// lidas do banco, para poderem ser testadas sem banco. Datas sempre pelo dia de Brasília (UTC−3).
const BRT = 3 * 3600e3;
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export const diaBRT = (t) => new Date(new Date(t).getTime() - BRT).toISOString().slice(0, 10);
// Vencimento é guardado à meia-noite UTC do dia (sem fuso): o dia é o da data UTC, não o de Brasília.
const diaVenc = (t) => new Date(t).toISOString().slice(0, 10);
export const mesBRT = (t) => diaBRT(t).slice(0, 7);
const dow = (dia) => new Date(dia + "T12:00:00Z").getUTCDay();
const somar = (dia, n) => new Date(new Date(dia + "T12:00:00Z").getTime() + n * 86400e3).toISOString().slice(0, 10);
const diasEntre = (a, b) => Math.round((new Date(b + "T12:00:00Z") - new Date(a + "T12:00:00Z")) / 86400e3);

// ["2026-06", ..., "2026-11"]: os n meses até o mês de `hoje`.
export function ultimosMeses(hoje, n) {
  let [y, m] = hoje.split("-").map(Number);
  const lista = [];
  for (let i = 0; i < n; i++) {
    lista.unshift(`${y}-${String(m).padStart(2, "0")}`);
    m--;
    if (m === 0) { m = 12; y--; }
  }
  return lista;
}
// Instante em que o mês termina (primeiro instante do mês seguinte, em Brasília).
export const fimDoMes = (mes) => {
  const [y, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(y, m, 1, 3));
};
export const inicioDoMes = (mes) => {
  const [y, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1, 3));
};
// Segundas-feiras das últimas n semanas (a atual inclusive).
export function ultimasSemanas(hoje, n) {
  const d = dow(hoje);
  const segunda = somar(hoje, -((d + 6) % 7));
  return Array.from({ length: n }, (_, i) => somar(segunda, -7 * (n - 1 - i)));
}
export const semanaDe = (dia) => somar(dia, -((dow(dia) + 6) % 7));

// 5) Carteira em Recebimento (capital) no fim de cada mês, reconstruída pelo histórico de etapas, e o que estava vencido e em aberto.
export function carteiraPorMes({ meses, hoje, logs, capital, parcelas, etapa = "Recebimento" }) {
  const ordenados = [...logs].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const estado = new Map();
  let i = 0;
  return meses.map((mes) => {
    const fim = fimDoMes(mes);
    const corte = fim.getTime() > Date.now() ? new Date() : fim;
    while (i < ordenados.length && new Date(ordenados[i].createdAt) < corte) { estado.set(ordenados[i].contactId, ordenados[i].paraEtapa); i++; }
    let carteira = 0;
    for (const [id, e] of estado) if (e === etapa) carteira += capital.get(id) || 0;
    const refDia = mes === hoje.slice(0, 7) ? hoje : diaBRT(new Date(fim.getTime() - 1));
    let atrasado = 0;
    for (const p of parcelas) {
      if (diaVenc(p.dueDate) >= refDia) continue; // ainda não venceu (ou vence no próprio dia de referência)
      if (p.paid && p.paidAt && new Date(p.paidAt) < corte) continue; // já tinha sido paga
      atrasado += p.amount || 0;
    }
    return { mes, carteira: r2(carteira), atrasado: r2(atrasado) };
  });
}

// 6) Recuperação por semana: o que entrou de parcela que JÁ estava vencida, e quanto isso pesa no recebido da semana.
export function recuperacaoPorSemana({ semanas, itens }) {
  const mapa = new Map(semanas.map((s) => [s, { semana: s, recebido: 0, recuperado: 0 }]));
  for (const it of itens) {
    const g = mapa.get(semanaDe(it.dia));
    if (!g) continue;
    g.recebido += it.valor || 0;
    if (it.atrasada) g.recuperado += it.valor || 0;
  }
  return [...mapa.values()].map((g) => ({ ...g, recebido: r2(g.recebido), recuperado: r2(g.recuperado), pct: g.recebido > 0 ? Math.round((g.recuperado / g.recebido) * 100) : 0 }));
}

// 8) Mapa de calor: dia da semana (0 = domingo) × hora, com o valor recebido e a quantidade de pagamentos.
export function calorDiaHora(entradas) {
  const valor = Array.from({ length: 7 }, () => Array(24).fill(0));
  const qtd = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const l of entradas) {
    const t = new Date(new Date(l.createdAt).getTime() - BRT);
    const d = t.getUTCDay();
    const h = t.getUTCHours();
    valor[d][h] += l.amount || 0;
    qtd[d][h] += 1;
  }
  return { valor: valor.map((l) => l.map(r2)), qtd, max: Math.max(0, ...valor.flat()) };
}

// 9 e 10) Ranking: soma de `valor` por nome (sem nome vira "Sem nome"), do maior para o menor.
export function ranking(linhas, nome, valor) {
  const m = new Map();
  for (const l of linhas) {
    const k = (nome(l) || "").trim() || "Sem nome";
    const g = m.get(k) || { nome: k, valor: 0, qtd: 0 };
    g.valor += valor(l) || 0;
    g.qtd += 1;
    m.set(k, g);
  }
  return [...m.values()].map((g) => ({ ...g, valor: r2(g.valor) })).sort((a, b) => b.valor - a.valor);
}

// 13) Quantos clientes chegaram a cada ciclo de empréstimo (1 = primeiro, 2 = 1ª renovação...) e que % do ciclo anterior renovou.
export function distribuicaoCiclos(ciclos, maximo = 6) {
  const cont = Array(maximo).fill(0);
  for (const c of ciclos) cont[Math.min(maximo, Math.max(1, Number(c) || 1)) - 1]++;
  // "chegaram": quem está no ciclo k também passou pelos anteriores.
  const chegaram = cont.map((_, i) => cont.slice(i).reduce((s, n) => s + n, 0));
  return chegaram.map((n, i) => ({ ciclo: i + 1, clientes: n, pctRenovou: i === 0 || chegaram[i - 1] === 0 ? null : Math.round((n / chegaram[i - 1]) * 100) }));
}

// 14) Ticket médio de empréstimo por mês (capital liberado ÷ nº de liberações).
export function ticketPorMes({ meses, liberacoes }) {
  const m = new Map(meses.map((x) => [x, { mes: x, qtd: 0, total: 0 }]));
  for (const l of liberacoes) { const g = m.get(mesBRT(l.createdAt)); if (g) { g.qtd++; g.total += l.amount || 0; } }
  return [...m.values()].map((g) => ({ ...g, total: r2(g.total), ticket: g.qtd ? r2(g.total / g.qtd) : 0 }));
}

// 15) Atraso médio (em dias) das parcelas pagas no mês e % paga em dia.
export function prazoAtrasoPorMes({ meses, pagas }) {
  const m = new Map(meses.map((x) => [x, { mes: x, n: 0, soma: 0, emDia: 0 }]));
  for (const p of pagas) {
    const g = m.get(mesBRT(p.paidAt));
    if (!g) continue;
    const atraso = Math.max(0, diasEntre(diaVenc(p.dueDate), diaBRT(p.paidAt)));
    g.n++; g.soma += atraso; if (atraso === 0) g.emDia++;
  }
  return [...m.values()].map((g) => ({ mes: g.mes, n: g.n, mediaDias: g.n ? Math.round((g.soma / g.n) * 10) / 10 : 0, pctEmDia: g.n ? Math.round((g.emDia / g.n) * 100) : 0 }));
}

// 17) Perdas: clientes que foram para Cravo em cada mês (cada cliente conta uma vez por mês) e o capital deles.
export function perdasPorMes({ meses, logsCravo, capital }) {
  const m = new Map(meses.map((x) => [x, { mes: x, ids: new Set(), valor: 0 }]));
  for (const l of logsCravo) {
    const g = m.get(mesBRT(l.createdAt));
    if (!g || g.ids.has(l.contactId)) continue;
    g.ids.add(l.contactId);
    g.valor += capital.get(l.contactId) || 0;
  }
  return [...m.values()].map((g) => ({ mes: g.mes, clientes: g.ids.size, valor: r2(g.valor) }));
}

// 18) Promessas de pagamento por quem registrou: cumprida = entrou dinheiro do cliente entre o registro e o fim do dia prometido;
// quebrada = o dia passou sem pagamento; pendente = ainda dentro do prazo.
export function promessasPorUsuario({ tentativas, entradas, hoje }) {
  const m = new Map();
  for (const t of tentativas) {
    if (!t.dataPromessa) continue;
    const nome = (t.usuario || "").trim() || "Sem nome";
    const g = m.get(nome) || { nome, cumpridas: 0, quebradas: 0, pendentes: 0 };
    const diaPrometido = new Date(t.dataPromessa).toISOString().slice(0, 10);
    const fimPrazo = new Date(`${somar(diaPrometido, 1)}T00:00:00-03:00`);
    const pagou = (entradas.get(t.contactId) || []).some((x) => new Date(x) >= new Date(t.createdAt) && new Date(x) < fimPrazo);
    if (pagou) g.cumpridas++;
    else if (diaPrometido < hoje) g.quebradas++;
    else g.pendentes++;
    m.set(nome, g);
  }
  return [...m.values()].map((g) => {
    const fechadas = g.cumpridas + g.quebradas;
    return { ...g, pctCumprido: fechadas ? Math.round((g.cumpridas / fechadas) * 100) : null };
  }).sort((a, b) => b.cumpridas + b.quebradas + b.pendentes - (a.cumpridas + a.quebradas + a.pendentes));
}

// 20) Resultado mensal: juros estimados (o recebido menos o capital que ele carrega, pela taxa configurada), despesas e lucro.
export function resultadoMensal({ meses, entradas, despesas, honorariosPct }) {
  const m = new Map(meses.map((x) => [x, { mes: x, recebido: 0, despesas: 0 }]));
  for (const l of entradas) { const g = m.get(mesBRT(l.createdAt)); if (g) g.recebido += l.amount || 0; }
  for (const l of despesas) { const g = m.get(mesBRT(l.createdAt)); if (g) g.despesas += l.amount || 0; }
  return [...m.values()].map((g) => {
    const juros = g.recebido - g.recebido / (1 + (Number(honorariosPct) || 0) / 100);
    return { mes: g.mes, recebido: r2(g.recebido), juros: r2(juros), despesas: r2(g.despesas), lucro: r2(juros - g.despesas) };
  });
}
