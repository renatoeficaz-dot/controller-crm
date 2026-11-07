import { prisma } from "@/lib/prisma";
import { whereRecebidoEntre, HONORARIOS_15X } from "@/lib/finance";

// Tudo aqui compara em data LOCAL. O banco guarda timestamps reais, então o dia
// de uma baixa é sempre derivado com toLocaleDateString — usar a data UTC faria
// a baixa da noite (UTC-3) cair no dia seguinte.
export const diaLocal = (d) => new Date(d).toLocaleDateString("en-CA");
export const hojeStr = () => new Date().toLocaleDateString("en-CA");

// "YYYY-MM-DD" -> Date de meia-noite UTC (chave usada em MetaDiaria.dia e
// MetaVendasData.data). É só uma CHAVE interna — nunca comparada com um
// timestamp real de evento (paidAt, entrouRecebimentoEm...), só usada pra
// gravar/achar a linha daquele dia, sempre com essa mesma função dos dois
// lados. Por isso NÃO mexe aqui: todo histórico já gravado usa meia-noite
// UTC como chave, e mudar isso agora desencontraria as linhas antigas do
// banco das novas. Pra filtrar um timestamp real dentro do dia BRASILEIRO
// (o caso que tinha bug de verdade), usa limiteDiaBrasil abaixo.
export const chaveDia = (dia) => new Date(dia + "T00:00:00.000Z");

// "YYYY-MM-DD" -> Date de meia-noite NO BRASIL, pra usar como limite (gte/lt)
// ao filtrar um timestamp REAL de evento (paidAt, valorPagoEm,
// entrouRecebimentoEm...) pelo dia brasileiro.
//
// BUG REAL (achado em 09/09, reportado pelo kbrito: "coisas de ontem contando
// como hj, 00 ate as 23:59 horario do brasil"): esses filtros usavam
// chaveDia (meia-noite UTC) pra isso — só que meia-noite UTC é 21:00 em
// Brasília (Brasil é UTC-3 o ano inteiro, sem horário de verão desde 2019).
// A janela do dia "09/09" começava 3h ANTES do que devia — 21:00 do dia
// 08/09 —, então toda baixa feita entre 21:00 e 23:59 caía no dia seguinte.
export const limiteDiaBrasil = (dia) => new Date(dia + "T03:00:00.000Z");

export function somarDias(dia, n) {
  const d = chaveDia(dia);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Domingo é folga: a operação vende e cobra de segunda a sábado, então dia útil
// aqui exclui só domingo.
export const ehDiaUtil = (dia) => chaveDia(dia).getUTCDay() !== 0;

export function diasDoMes(dia) {
  const d = chaveDia(dia);
  const ano = d.getUTCFullYear();
  const mes = d.getUTCMonth();
  const ultimo = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return Array.from({ length: ultimo }, (_, i) =>
    new Date(Date.UTC(ano, mes, i + 1)).toISOString().slice(0, 10)
  );
}

// % de recebimento pode passar de 100 (meta acima do que vence no dia)
const clamp100 = (v) => Math.min(1000, Math.max(0, Number(v) || 0));

// Quanto PRECISARIA ser recebido em cada dia: a soma das parcelas que vencem no dia (R$). A meta de recebimento é um % disso
// (receber tudo que vence = 100%), em vez de % da quantidade de leads em Recebimento.
// Fora: lead excluído e Venda perdida; parcela substituída por acordo; e parcela em aberto de lead em Cravo (cobrança à parte).
// Devolve Map(dia → { total, porUsuario }) — porUsuario pelo responsável do lead.
export async function esperadoPorDia(diaInicio, diaFim) {
  const parcelas = await prisma.parcela.findMany({
    where: {
      dueDate: { gte: chaveDia(diaInicio), lt: chaveDia(somarDias(diaFim, 1)) },
      renegociada: false,
      contact: { is: { excluidoEm: null, stage: { name: { not: "Venda perdida" } } } },
    },
    select: { contactId: true, ciclo: true, dueDate: true, amount: true, paid: true, contact: { select: { responsavel: true, stage: { select: { name: true } } } } },
  });
  // Parte de CAPITAL de cada parcela (o que volta ao caixa; o resto é honorário): amount / (1 + honorários%). Ciclo parcelado em 15x
  // (renovação) tem honorários próprios (HONORARIOS_15X). Detecta o 15x pela existência de parcela de número 11 a 15 no ciclo.
  const cfg = await prisma.config.findUnique({ where: { id: "singleton" }, select: { honorariosPct: true } });
  const hPct = cfg?.honorariosPct ?? 30;
  const ids = [...new Set(parcelas.map((p) => p.contactId))];
  const longos = ids.length
    ? await prisma.parcela.findMany({ where: { contactId: { in: ids }, number: { gt: 10, lt: 1000 } }, select: { contactId: true, ciclo: true }, distinct: ["contactId", "ciclo"] })
    : [];
  const ehLongo = new Set(longos.map((x) => x.contactId + ":" + x.ciclo));
  const mapa = new Map();
  for (const p of parcelas) {
    if (p.contact?.stage?.name !== "Recebimento") continue; // a meta só conta cliente na etapa Recebimento (Cravo e as outras ficam fora)
    const dia = p.dueDate.toISOString().slice(0, 10);
    if (!mapa.has(dia)) mapa.set(dia, { total: 0, porUsuario: {}, capital: 0, capitalPorUsuario: {} });
    const g = mapa.get(dia);
    const v = p.amount || 0;
    const cap = v / (1 + (ehLongo.has(p.contactId + ":" + p.ciclo) ? HONORARIOS_15X : hPct) / 100);
    g.total += v;
    g.capital += cap;
    const nome = p.contact?.responsavel || "— sem responsável —";
    g.porUsuario[nome] = (g.porUsuario[nome] || 0) + v;
    g.capitalPorUsuario[nome] = (g.capitalPorUsuario[nome] || 0) + cap;
  }
  return mapa;
}
const capitalDe = (g, nomes) => (!g ? 0 : nomes ? nomes.reduce((s, n) => s + (g.capitalPorUsuario[n] || 0), 0) : g.capital);

// Capital LIBERADO por dia (R$): empréstimo novo + renovação, lido do lançamento de saída "Liberação de capital".
// Devolve Map(dia → total), filtrado pelo responsável do lead quando `nomes` é passado.
export async function liberadoPorDia(diaInicio, diaFim, nomes = null) {
  const ls = await prisma.lancamento.findMany({
    where: { type: "saida", description: { startsWith: "Liberação de capital" }, createdAt: { gte: limiteDiaBrasil(diaInicio), lt: limiteDiaBrasil(somarDias(diaFim, 1)) } },
    select: { amount: true, createdAt: true, contactId: true },
  });
  let permitido = null;
  if (nomes) {
    const cs = await prisma.contact.findMany({ where: { id: { in: [...new Set(ls.map((l) => l.contactId).filter(Boolean))] }, responsavel: { in: nomes } }, select: { id: true } });
    permitido = new Set(cs.map((c) => c.id));
  }
  const mapa = new Map();
  for (const l of ls) {
    if (permitido && !permitido.has(l.contactId)) continue;
    const dia = diaLocal(l.createdAt);
    mapa.set(dia, (mapa.get(dia) || 0) + (l.amount || 0));
  }
  return mapa;
}

// Metas de liberação: % do capital que volta no dia. 100% = liberar o que voltou (a operação se mantém do mesmo tamanho);
// acima de 100% a operação cresce (o ciclo seguinte recebe mais).
// Sábado a meta de liberação vale a metade (`dia` = "YYYY-MM-DD"; sem dia, não aplica).
export const FATOR_LIBERACAO_SABADO = 0.5;
export function metaLiberacaoDe(capital, cfg, dia = null) {
  const p = (c, pad) => Math.max(0, Math.min(1000, Number(cfg?.[c] ?? pad) || 0));
  const fator = dia && chaveDia(dia).getUTCDay() === 6 ? FATOR_LIBERACAO_SABADO : 1;
  return {
    pctMinima: p("metaPctLiberacaoMinima", 80),
    pctMedia: p("metaPctLiberacaoMedia", 100),
    pctMeta: p("metaPctLiberacao", 110),
    minima: r2v((capital * p("metaPctLiberacaoMinima", 80) * fator) / 100),
    media: r2v((capital * p("metaPctLiberacaoMedia", 100) * fator) / 100),
    dia: r2v((capital * p("metaPctLiberacao", 110) * fator) / 100),
  };
}
const esperadoDe = (g, nomes) => (!g ? 0 : nomes ? nomes.reduce((s, n) => s + (g.porUsuario[n] || 0), 0) : g.total);
const r2v = (n) => Math.round(n * 100) / 100;

// Filtro da CARTEIRA que vale pra meta de recebimento de um dia.
//
// Quem foi liberado HOJE não entra: a 1ª cobrança dele é sempre no dia
// seguinte ao pagamento do capital (ver gerarParcelas), então contá-lo hoje
// aumenta a meta com um cliente que não tem como pagar hoje — o time perseguia
// um número impossível, e ele ainda puxava o bônus do cobrador junto.
//
// `entrouRecebimentoEm: null` PRECISA entrar: é cadastro antigo, carteira de
// verdade. Um filtro só com `lt` descartaria essas linhas em silêncio, que é
// exatamente o tipo de erro que já mordeu este sistema antes.
export function whereCarteiraRecebimento(stageId, dia = hojeStr()) {
  return {
    stageId,
    excluidoEm: null,
    OR: [
      { entrouRecebimentoEm: null },
      { entrouRecebimentoEm: { lt: chaveDia(dia) } },
    ],
  };
}
// Parcela parcial (paid=false) recebeu dinheiro de verdade: o valor dela e
// o valorPago acumulado, nao o amount cheio (que ainda nem foi pago).
const valorPago = (p) => (p.paid === false ? p.valorPago || 0 : p.amountPago != null ? p.amountPago : p.amount);

// Início (segunda-feira) da semana de comissão em andamento — mesma regra de lib/comissao.js (no domingo vale a semana que acabou de
// fechar). Dessa segunda em diante as % de meta valem as configuradas AGORA: ajustar a meta no meio da semana vale para a semana toda,
// no Metas e na comissão (pedido do Renato). Antes disso, valem as % gravadas no retrato de cada dia.
export function inicioSemanaVigente(hoje = hojeStr()) {
  const d = chaveDia(hoje);
  const dow = d.getUTCDay(); // 0 = domingo ... 6 = sábado
  d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return d.toISOString().slice(0, 10);
}

const TAM_LOTE = 5000; // limite de variáveis do SQLite numa cláusula IN
async function emLotes(ids, fn) {
  const out = [];
  for (let i = 0; i < ids.length; i += TAM_LOTE) out.push(...(await fn(ids.slice(i, i + TAM_LOTE))));
  return out;
}

// ÚNICA fonte do "recebido" por dia: Metas (cartão, calendário, série, placar, lista de baixas) e comissão leem daqui — por isso nunca
// divergem. Recebido = dinheiro que ENTROU no caixa no dia de Brasília (lançamentos de entrada ligados a parcela), com duas travas:
//  1. Por parcela, o que entrou não passa do que ela pagou (amountPago; parcial: valorPago). Baixa lançada em dobro (tela
//     desatualizada, clique repetido) não infla meta nem comissão: o excesso é cortado, na ordem cronológica.
//  2. Parcela paga SEM nenhum lançamento (baixa antiga/manual) entra pelo valor dela, no dia da baixa.
// Cada dia vale pelo que entrou NAQUELE dia, mesmo que a parcela só tenha quitado depois (pagamento em duas vezes). Crédito é de quem
// deu a baixa (`baixadoPor`): `usuario` (nome ou lista) filtra por isso. Devolve { porDia: Map(dia → {valor, recuperado, baixas,
// clientes}), itens: [{ id, contactId, nome, phone, parcela, valor, hora, dia, baixadoPor, atrasada }] } — itens = uma linha por parcela/dia.
export async function recebidosNoPeriodo(diaInicio, diaFim, usuario = null) {
  const de = limiteDiaBrasil(diaInicio);
  const ate = limiteDiaBrasil(somarDias(diaFim, 1));
  const nomes = Array.isArray(usuario) ? usuario : usuario ? [usuario] : null;
  const selParcela = {
    id: true, number: true, amount: true, amountPago: true, paid: true, valorPago: true, valorPagoEm: true, paidAt: true,
    dueDate: true, baixadoPor: true, contactId: true, contact: { select: { name: true, phone: true } },
  };

  const entradas = await prisma.lancamento.findMany({
    where: { type: "entrada", parcelaId: { not: null }, createdAt: { gte: de, lt: ate } },
    select: { parcelaId: true, amount: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const ids = [...new Set(entradas.map((l) => l.parcelaId))];
  const [antes, parcelas] = ids.length
    ? await Promise.all([
        emLotes(ids, (lote) => prisma.lancamento.findMany({ where: { type: "entrada", parcelaId: { in: lote }, createdAt: { lt: de } }, select: { parcelaId: true, amount: true } })),
        emLotes(ids, (lote) => prisma.parcela.findMany({ where: { id: { in: lote } }, select: selParcela })),
      ])
    : [[], []];
  const jaEntrou = new Map(); // parcelaId → quanto já tinha entrado ANTES do período (conta para o teto)
  for (const l of antes) jaEntrou.set(l.parcelaId, (jaEntrou.get(l.parcelaId) || 0) + (l.amount || 0));
  const porParcela = new Map(parcelas.map((x) => [x.id, x]));

  const itens = new Map(); // `${parcelaId}|${dia}` → item
  const adiciona = (p, dia, valor, hora) => {
    const k = p.id + "|" + dia;
    const it = itens.get(k) || {
      id: p.id, contactId: p.contactId, nome: p.contact?.name || "", phone: p.contact?.phone || "", parcela: p.number,
      valor: 0, hora, dia, baixadoPor: p.baixadoPor || null, atrasada: dia > diaVencimento(p.dueDate),
    };
    it.valor += valor;
    if (hora > it.hora) it.hora = hora;
    itens.set(k, it);
  };

  for (const l of entradas) {
    const p = porParcela.get(l.parcelaId);
    if (!p) continue;
    if (nomes && !nomes.includes(p.baixadoPor)) continue;
    const teto = p.paid ? (p.amountPago != null ? p.amountPago : Infinity) : p.valorPago || 0;
    const acum = jaEntrou.get(p.id) || 0;
    const falta = teto - acum;
    const cabe = (l.amount || 0) <= falta + 0.01 ? l.amount || 0 : Math.max(0, falta);
    jaEntrou.set(p.id, acum + cabe);
    if (cabe > 0.004) adiciona(p, diaLocal(l.createdAt), cabe, l.createdAt);
  }

  // Trava 2: baixas do período sem nenhum lançamento de entrada (nem neste período, nem antes/depois).
  const pagas = await prisma.parcela.findMany({ where: whereRecebidoEntre(de, ate), select: selParcela });
  const candidatas = pagas.filter((x) => !porParcela.has(x.id));
  if (candidatas.length) {
    const comLanc = new Set(
      (await emLotes(candidatas.map((x) => x.id), (lote) => prisma.lancamento.findMany({ where: { type: "entrada", parcelaId: { in: lote } }, select: { parcelaId: true }, distinct: ["parcelaId"] }))).map((l) => l.parcelaId)
    );
    for (const p of candidatas) {
      if (comLanc.has(p.id)) continue; // o caixa dessa parcela está em outro período
      if (nomes && !nomes.includes(p.baixadoPor)) continue;
      const quando = dataRecebimento(p);
      const v = valorPago(p);
      if (quando && v > 0) adiciona(p, diaLocal(quando), v, quando);
    }
  }

  const porDia = new Map();
  for (const it of itens.values()) {
    const d = porDia.get(it.dia) || { valor: 0, recuperado: 0, baixas: 0, clientes: new Set() };
    d.valor += it.valor;
    if (it.atrasada) d.recuperado += it.valor;
    d.baixas += 1;
    d.clientes.add(it.contactId);
    porDia.set(it.dia, d);
  }
  return { porDia, itens: [...itens.values()].map((it) => ({ ...it, valor: r2v(it.valor) })).sort((a, b) => b.hora - a.hora) };
}

// Vencimento é gravado como meia-noite UTC representando o dia — então sai por
// toISOString, não por data local (que puxaria pro dia anterior em UTC-3).
// `String(date)` NÃO serve aqui: dá "Fri Jul 24 2026 ...", não ISO.
export const diaVencimento = (d) => new Date(d).toISOString().slice(0, 10);

// Uma parcela conta como RECUPERAÇÃO quando foi paga depois do vencimento —
// cobrar quem já atrasou é o esforço que a meta de recuperação mede.
// Data em que o dinheiro entrou: baixa completa usa paidAt, parcial usa
// valorPagoEm (paidAt so e preenchido quando a parcela fecha).
export const dataRecebimento = (p) => p.paidAt || p.valorPagoEm || null;
export const foiRecuperacao = (p) => {
  const d = dataRecebimento(p);
  return !!d && diaLocal(d) > diaVencimento(p.dueDate);
};

/* ------------------------------------------------------------------ *
 * Retrato do dia (MetaDiaria)
 * ------------------------------------------------------------------ */

// Grava/atualiza o retrato de hoje: metas vigentes + tamanho da carteira +
// resultado até agora. Roda a cada 5 min, então a última gravação do dia é o
// estado de fechamento.
export async function registrarMetaDoDia(hoje = hojeStr()) {
  const cfg = await prisma.config.findUnique({ where: { id: "singleton" } });
  // Item 118: dia da semana pode ter meta própria (ex.: sábado mais fraco) —
  // quando não há linha pro dia, cai na meta global de sempre.
  const diaSemana = chaveDia(hoje).getUTCDay();
  // Metas por dia da semana e por data do calendário foram removidas: vale sempre a meta global (Configurações → Metas).
  const overrideDia = null;
  // Meta de um dia ESPECÍFICO do calendário (ex.: curva de campanha) tem
  // prioridade sobre a do dia da semana — sem isso, uma meta crescente dia a
  // dia cairia sempre na mesma meta de "toda terça", perdendo a curva.
  const overrideData = null;
  const stage = await prisma.stage.findFirst({ where: { name: "Recebimento" } });

  const carteira = stage
    ? await prisma.contact.findMany({
        // excluidoEm: null — lead na lixeira (24h de desfazer) não é carteira
        // de verdade; sem isso ele inflava a base da meta de recebimento.
        where: whereCarteiraRecebimento(stage.id, hoje),
        select: { responsavel: true },
      })
    : [];

  const porUsuario = {};
  for (const c of carteira) {
    const nome = c.responsavel || "— sem responsável —";
    porUsuario[nome] = (porUsuario[nome] || 0) + 1;
  }
  const totalEmRecebimento = carteira.length;

  const pctMin = clamp100(overrideDia?.metaPctRecebimentoMinima ?? cfg?.metaPctRecebimentoMinima ?? 40);
  const pctMed = clamp100(overrideDia?.metaPctRecebimentoMedia ?? cfg?.metaPctRecebimentoMedia ?? 55);
  const pctMeta = clamp100(overrideDia?.metaPctRecebimento ?? cfg?.metaPctRecebimento ?? 70);

  const esperadoHoje = (await esperadoPorDia(hoje, hoje)).get(hoje);
  const base$ = esperadoDe(esperadoHoje, null);
  const real = await resultadoDoDia(hoje);
  const renovacoes = await contarRenovacoesDoDia(hoje);

  const dados = {
    metaVendasMinima: overrideDia?.metaVendasMinima ?? cfg?.metaVendasMinima ?? 2,
    metaVendasMedia: overrideDia?.metaVendasMedia ?? cfg?.metaVendasMedia ?? 3,
    metaVendasDia: overrideData?.metaVendasDia ?? overrideDia?.metaVendasDia ?? cfg?.metaVendasDia ?? 5,
    metaPctRecebimentoMinima: pctMin,
    metaPctRecebimentoMedia: pctMed,
    metaPctRecebimento: pctMeta,
    totalEmRecebimento,
    // R$: % de tudo que vence no dia (ver esperadoPorDia). Retratos antigos guardam a contagem de parcelas, mas quem lê recalcula em R$.
    metaRecebimentosMinima: Math.round((base$ * pctMin) / 100), // coluna Int: arredonda (quem lê recalcula em R$ com centavos)
    metaRecebimentosMedia: Math.round((base$ * pctMed) / 100), // coluna Int: arredonda (quem lê recalcula em R$ com centavos)
    metaRecebimentosDia: Math.round((base$ * pctMeta) / 100), // coluna Int: arredonda (quem lê recalcula em R$ com centavos)
    metaValorVendasMinima: cfg?.metaValorVendasMinima ?? 0,
    metaValorVendasMedia: cfg?.metaValorVendasMedia ?? 0,
    metaValorVendasDia: cfg?.metaValorVendasDia ?? 0,
    metaRecuperacaoMinima: cfg?.metaRecuperacaoMinima ?? 0,
    metaRecuperacaoMedia: cfg?.metaRecuperacaoMedia ?? 0,
    metaRecuperacaoDia: cfg?.metaRecuperacaoDia ?? 0,
    metaRenovacaoMinima: overrideDia?.metaRenovacaoMinima ?? cfg?.metaRenovacaoMinima ?? 0,
    metaRenovacaoMedia: overrideDia?.metaRenovacaoMedia ?? cfg?.metaRenovacaoMedia ?? 0,
    metaRenovacaoDia: overrideDia?.metaRenovacaoDia ?? cfg?.metaRenovacaoDia ?? 0,
    renovacoes,
    carteiraPorUsuario: JSON.stringify(porUsuario),
    vendas: real.vendas,
    recebimentos: real.baixas, // coluna Int (contagem); o valor em R$ vem de valorRecebido
    baixas: real.baixas,
    valorRecebido: real.valorRecebido,
    valorVendido: real.valorVendido,
    valorRecuperado: real.valorRecuperado,
  };

  await prisma.metaDiaria.upsert({
    where: { dia: chaveDia(hoje) },
    update: dados,
    create: { dia: chaveDia(hoje), ...dados },
  });

  return dados;
}

/* ------------------------------------------------------------------ *
 * Resultado real de um dia (sempre calculado do dado bruto — é exato)
 * ------------------------------------------------------------------ */

// usuario: null = empresa toda; string = só o que é daquela pessoa.
// Venda é do RESPONSÁVEL pelo lead; recebimento é de quem DEU A BAIXA — são
// papéis diferentes e atribuir os dois à mesma pessoa distorceria o placar.
export async function resultadoDoDia(dia, usuario = null) {
  // limiteDiaBrasil, não chaveDia: aqui filtra timestamp REAL de evento
  // (entrouRecebimentoEm, paidAt...), não faz lookup de chave de MetaDiaria —
  // precisa do limite certo do dia brasileiro (ver limiteDiaBrasil).
  const de = limiteDiaBrasil(dia);
  const ate = limiteDiaBrasil(somarDias(dia, 1));
  // usuario pode ser um nome (pessoa) ou um array de nomes (item 117: equipe).
  const filtro = Array.isArray(usuario) ? { in: usuario } : usuario;

  // excluidoEm: lead excluido nao pode continuar contando como venda do dia.
  // valorCapital > 0: entrada em Recebimento sem valor emprestado nao e venda
  // de verdade (cadastro incompleto/movido por engano), nao deve contar nem
  // aparecer na lista de vendas fechadas.
  const whereVenda = { entrouRecebimentoEm: { gte: de, lt: ate }, excluidoEm: null, valorCapital: { gt: 0 }, stage: { name: { not: "Venda perdida" } } };
  if (usuario) whereVenda.responsavel = filtro;

  const liberadoMapa = await liberadoPorDia(dia, dia, usuario ? (Array.isArray(usuario) ? usuario : [usuario]) : null);
  const [vendasList, recebido] = await Promise.all([
    prisma.contact.findMany({ where: whereVenda, select: { valorCapital: true } }),
    recebidosNoPeriodo(dia, dia, usuario),
  ]);
  const rec = recebido.porDia.get(dia) || { valor: 0, recuperado: 0, baixas: 0, clientes: new Set() };

  return {
    vendas: vendasList.length,
    valorVendido: vendasList.reduce((s, c) => s + (c.valorCapital || 0), 0),
    liberado: r2v(liberadoMapa.get(dia) || 0), // capital liberado (novo + renovação), base da meta de liberação
    // Recebimentos = TUDO que entrou no caixa no dia (atrasadas, juros e multa inclusive); a base (100%) é a das parcelas que vencem no
    // dia. `baixas` = parcelas que receberam dinheiro no dia (várias entradas na mesma parcela contam 1).
    recebimentos: r2v(rec.valor),
    baixas: rec.baixas,
    valorRecebido: r2v(rec.valor),
    valorRecuperado: r2v(rec.recuperado),
    // Clientes DISTINTOS que pagaram pelo menos 1 parcela no dia.
    clientesRecebimento: rec.clientes.size,
  };
}

// Renovação: cliente que já estava na carteira e pegou capital de novo (ciclo
// incrementado). Não usa entrouRecebimentoEm (isso só muda numa entrada nova),
// o marcador é renovadoEm — gravado só em app/api/contacts/[id]/renovar.
export async function contarRenovacoesDoDia(dia, usuario = null) {
  const de = limiteDiaBrasil(dia);
  const ate = limiteDiaBrasil(somarDias(dia, 1));
  const filtro = Array.isArray(usuario) ? { in: usuario } : usuario;
  const where = { renovadoEm: { gte: de, lt: ate } };
  if (usuario) where.responsavel = filtro;
  return prisma.contact.count({ where });
}

/* ------------------------------------------------------------------ *
 * Metas de um dia — do retrato quando existe, da config quando não
 * ------------------------------------------------------------------ */

// equipeMeta (item 117): metas próprias de uma equipe (mesmos campos do
// Config), com prioridade sobre a meta global quando usuario é a lista de
// membros dessa equipe. `usuario` aceita string (pessoa) ou array (equipe).
// usarConfigAtual: dias passados também usam as % configuradas AGORA (e não as do retrato do dia) — é o que a comissão semanal quer
// quando a meta é ajustada no meio da semana.
export async function metasDoDia(dia, usuario = null, equipeMeta = null, usarConfigAtual = false) {
  const nomes = Array.isArray(usuario) ? usuario : usuario ? [usuario] : null;
  const [snap, cfg, users, overrideData] = await Promise.all([
    prisma.metaDiaria.findUnique({ where: { dia: chaveDia(dia) } }),
    prisma.config.findUnique({ where: { id: "singleton" } }),
    nomes && !Array.isArray(usuario)
      ? prisma.user.findMany({
          where: { name: usuario },
          select: { metaVendasMinimaPropria: true, metaVendasMediaPropria: true, metaVendasDiaPropria: true },
        })
      : Promise.resolve([]),
    // Dia sem retrato ainda (futuro) — a meta de calendário específico vale
    // como prévia, senão navegar pro mês que vem não mostraria a curva
    // planejada até o dia realmente chegar e ser gravado no retrato.
    Promise.resolve(null),
  ]);

  // Carteira: do retrato do dia quando existe (é o único jeito de saber o
  // tamanho que ela tinha), senão a de agora.
  let totalEmRecebimento;
  let carteiraDoUsuario = null;
  if (snap) {
    totalEmRecebimento = snap.totalEmRecebimento;
    if (nomes) {
      const mapa = JSON.parse(snap.carteiraPorUsuario || "{}");
      carteiraDoUsuario = nomes.reduce((s, n) => s + (mapa[n] ?? 0), 0);
    }
  } else {
    const stage = await prisma.stage.findFirst({ where: { name: "Recebimento" } });
    totalEmRecebimento = stage
      ? await prisma.contact.count({ where: whereCarteiraRecebimento(stage.id, dia) })
      : 0;
    if (nomes && stage) {
      carteiraDoUsuario = await prisma.contact.count({
        where: { ...whereCarteiraRecebimento(stage.id, dia), responsavel: { in: nomes } },
      });
    }
  }

  // Hoje vale o que está configurado AGORA (o retrato só atualiza a cada 5 min); dias passados, o do retrato.
  const vivo = null;
  // Na semana de comissão em andamento todos os dias valem pela config de agora (ver inicioSemanaVigente) — assim o Metas e a comissão
  // mostram as mesmas faixas; antes dela, vale o retrato do dia.
  const vigente = usarConfigAtual || dia >= inicioSemanaVigente();
  const doDia = (campo, padrao) => (dia === hojeStr() || vigente
    ? equipeMeta?.[campo] ?? vivo?.[campo] ?? clamp100(cfg?.[campo] ?? padrao)
    : equipeMeta?.[campo] ?? snap?.[campo] ?? clamp100(cfg?.[campo] ?? padrao));
  const pctMin = doDia("metaPctRecebimentoMinima", 40);
  const pctMed = doDia("metaPctRecebimentoMedia", 55);
  const pctMeta = doDia("metaPctRecebimento", 70);

  const base = nomes ? carteiraDoUsuario ?? 0 : totalEmRecebimento;
  const esperadoG = (await esperadoPorDia(dia, dia)).get(dia);
  const esperado = esperadoDe(esperadoG, nomes);
  const capitalVolta = capitalDe(esperadoG, nomes);
  const metaLib = metaLiberacaoDe(capitalVolta, cfg, dia);

  // Meta de vendas: a pessoal do usuário quando ele tem as três definidas;
  // senão a da equipe quando ela tem as três definidas.
  const u = users[0];
  const temPropria =
    u && u.metaVendasMinimaPropria != null && u.metaVendasMediaPropria != null && u.metaVendasDiaPropria != null;
  const temEquipe =
    !temPropria && equipeMeta && equipeMeta.metaVendasMinima != null && equipeMeta.metaVendasMedia != null && equipeMeta.metaVendasDia != null;

  return {
    doRetrato: !!snap,
    totalEmRecebimento,
    carteiraDoUsuario,
    baseRecebimento: base,

    metaVendasMinima: temPropria ? u.metaVendasMinimaPropria : temEquipe ? equipeMeta.metaVendasMinima : snap?.metaVendasMinima ?? cfg?.metaVendasMinima ?? 2,
    metaVendasMedia: temPropria ? u.metaVendasMediaPropria : temEquipe ? equipeMeta.metaVendasMedia : snap?.metaVendasMedia ?? cfg?.metaVendasMedia ?? 3,
    metaVendasDia: temPropria ? u.metaVendasDiaPropria : temEquipe ? equipeMeta.metaVendasDia : snap?.metaVendasDia ?? overrideData?.metaVendasDia ?? cfg?.metaVendasDia ?? 5,
    metaVendasPropria: false, // meta de vendas por quantidade deixou de ser usada (agora é liberação em R$)

    metaPctRecebimentoMinima: pctMin,
    metaPctRecebimentoMedia: pctMed,
    metaPctRecebimento: pctMeta,
    valorEsperadoDia: r2v(esperado),
    capitalVoltaDia: r2v(capitalVolta),
    metaPctLiberacaoMinima: metaLib.pctMinima,
    metaPctLiberacaoMedia: metaLib.pctMedia,
    metaPctLiberacao: metaLib.pctMeta,
    metaLiberacaoMinima: metaLib.minima,
    metaLiberacaoMedia: metaLib.media,
    metaLiberacaoDia: metaLib.dia,
    metaRecebimentosMinima: r2v((esperado * pctMin) / 100),
    metaRecebimentosMedia: r2v((esperado * pctMed) / 100),
    metaRecebimentosDia: r2v((esperado * pctMeta) / 100),

    metaValorVendasMinima: snap?.metaValorVendasMinima ?? cfg?.metaValorVendasMinima ?? 0,
    metaValorVendasMedia: snap?.metaValorVendasMedia ?? cfg?.metaValorVendasMedia ?? 0,
    metaValorVendasDia: snap?.metaValorVendasDia ?? cfg?.metaValorVendasDia ?? 0,

    metaRecuperacaoMinima: snap?.metaRecuperacaoMinima ?? cfg?.metaRecuperacaoMinima ?? 0,
    metaRecuperacaoMedia: snap?.metaRecuperacaoMedia ?? cfg?.metaRecuperacaoMedia ?? 0,
    metaRecuperacaoDia: snap?.metaRecuperacaoDia ?? cfg?.metaRecuperacaoDia ?? 0,

    metaRenovacaoMinima: snap?.metaRenovacaoMinima ?? cfg?.metaRenovacaoMinima ?? 0,
    metaRenovacaoMedia: snap?.metaRenovacaoMedia ?? cfg?.metaRenovacaoMedia ?? 0,
    metaRenovacaoDia: snap?.metaRenovacaoDia ?? cfg?.metaRenovacaoDia ?? 0,
  };
}

/* ------------------------------------------------------------------ *
 * Série histórica — alimenta gráfico, calendário, sequência e médias
 * ------------------------------------------------------------------ */

// Resultado real de cada dia num intervalo, em uma varredura só (em vez de uma
// consulta por dia). `usuario` filtra vendas por responsável e baixas por quem
// deu a baixa.
export async function serieDeDias(diaInicio, diaFim, usuario = null, equipeMeta = null) {
  // Duas chaves diferentes de propósito: `de`/`ate` (limiteDiaBrasil) filtram
  // timestamp REAL de evento (entrouRecebimentoEm, paidAt...) — precisa do
  // limite do dia brasileiro certo, senão perde as baixas depois das 21h. Já
  // `deChave`/`ateChave` (chaveDia) só faz range sobre a CHAVE de
  // MetaDiaria/MetaVendasData — essa continua em meia-noite UTC porque é
  // assim que toda linha já gravada no banco está, e não dá pra mudar sem
  // migrar o histórico inteiro.
  const de = limiteDiaBrasil(diaInicio);
  const ate = limiteDiaBrasil(somarDias(diaFim, 1));
  const deChave = chaveDia(diaInicio);
  const ateChave = chaveDia(somarDias(diaFim, 1));
  const nomes = Array.isArray(usuario) ? usuario : usuario ? [usuario] : null;
  const filtro = Array.isArray(usuario) ? { in: usuario } : usuario;

  const whereVenda = { entrouRecebimentoEm: { gte: de, lt: ate }, excluidoEm: null, valorCapital: { gt: 0 }, stage: { name: { not: "Venda perdida" } } };
  if (usuario) whereVenda.responsavel = filtro;
  const whereRenovacao = { renovadoEm: { gte: de, lt: ate } };
  if (usuario) whereRenovacao.responsavel = filtro;

  const esperados = await esperadoPorDia(diaInicio, diaFim);
  const liberados = await liberadoPorDia(diaInicio, diaFim, nomes);
  const cfgLib = await prisma.config.findUnique({ where: { id: "singleton" } });
  const [vendas, recebido, renovacoes, snaps, overridesData] = await Promise.all([
    prisma.contact.findMany({ where: whereVenda, select: { valorCapital: true, entrouRecebimentoEm: true } }),
    // Mesma função do cartão do dia (resultadoDoDia): o dia do calendário/comissão nunca difere do dia do Metas.
    recebidosNoPeriodo(diaInicio, diaFim, usuario),
    prisma.contact.findMany({ where: whereRenovacao, select: { renovadoEm: true } }),
    prisma.metaDiaria.findMany({ where: { dia: { gte: deChave, lt: ateChave } } }),
    // Dias futuros no intervalo (sem retrato ainda) usam a meta de calendário
    // específico como prévia — é o que faz a curva de campanha aparecer no
    // calendário do mês antes mesmo dos dias chegarem.
    Promise.resolve([]),
  ]);

  const mapa = new Map();
  const garante = (dia) => {
    if (!mapa.has(dia)) {
      mapa.set(dia, {
        dia,
        vendas: 0,
        valorVendido: 0,
        baixas: 0,
        valorRecebido: 0,
        valorRecuperado: 0,
        semJuros: 0,
        renovacoes: 0,
        _clientes: new Set(),
      });
    }
    return mapa.get(dia);
  };

  let d = diaInicio;
  while (d <= diaFim) { garante(d); d = somarDias(d, 1); }

  for (const v of vendas) {
    const r = garante(diaLocal(v.entrouRecebimentoEm));
    r.vendas += 1;
    r.valorVendido += v.valorCapital || 0;
  }
  for (const [dia, x] of recebido.porDia) {
    const r = garante(dia);
    r.baixas += x.baixas;
    r.valorRecebido += x.valor;
    r.semJuros += x.valor;
    r.valorRecuperado += x.recuperado;
    for (const c of x.clientes) r._clientes.add(c);
  }
  for (const c of renovacoes) {
    const r = garante(diaLocal(c.renovadoEm));
    r.renovacoes += 1;
  }

  const semanaVigente = inicioSemanaVigente();
  const porSnap = new Map(snaps.map((s) => [s.dia.toISOString().slice(0, 10), s]));
  const porOverrideData = new Map(overridesData.map((o) => [o.data.toISOString().slice(0, 10), o]));

  return [...mapa.values()]
    .filter((r) => r.dia >= diaInicio && r.dia <= diaFim)
    .sort((a, b) => a.dia.localeCompare(b.dia))
    .map((r) => {
      const snap = porSnap.get(r.dia);
      const overrideData = porOverrideData.get(r.dia);
      const base = esperadoDe(esperados.get(r.dia), nomes);
      // % de meta do dia: equipe > (semana em andamento: config de agora) > retrato do dia.
      const vig = r.dia >= semanaVigente;
      const pctDe = (campo, padrao) => equipeMeta?.[campo] ?? (vig ? clamp100(cfgLib?.[campo] ?? padrao) : null) ?? snap?.[campo] ?? 0;
      const pct = pctDe("metaPctRecebimento", 70);
      return {
        dia: r.dia,
        diaUtil: ehDiaUtil(r.dia),
        vendas: r.vendas,
        valorVendido: Math.round(r.valorVendido * 100) / 100,
        // Igual resultadoDoDia: conta parcela baixada, não cliente distinto.
        recebimentos: Math.round(r.semJuros * 100) / 100,
        baixas: r.baixas,
        valorEsperado: r2v(base),
        liberado: r2v(liberados.get(r.dia) || 0),
        capitalVolta: r2v(capitalDe(esperados.get(r.dia), nomes)),
        metaLiberacaoMinima: metaLiberacaoDe(capitalDe(esperados.get(r.dia), nomes), cfgLib, r.dia).minima,
        metaLiberacaoMedia: metaLiberacaoDe(capitalDe(esperados.get(r.dia), nomes), cfgLib, r.dia).media,
        metaLiberacaoDia: metaLiberacaoDe(capitalDe(esperados.get(r.dia), nomes), cfgLib, r.dia).dia,
        valorRecebido: Math.round(r.valorRecebido * 100) / 100,
        valorRecuperado: Math.round(r.valorRecuperado * 100) / 100,
        renovacoes: r.renovacoes,
        // Metas do dia existem onde houve retrato OU onde há meta de
        // calendário específico marcada pra esse dia (campanha futura).
        temMeta: !!snap || !!overrideData,
        metaVendasMinima: equipeMeta?.metaVendasMinima ?? snap?.metaVendasMinima ?? null,
        metaVendasMedia: equipeMeta?.metaVendasMedia ?? snap?.metaVendasMedia ?? null,
        metaVendasDia: equipeMeta?.metaVendasDia ?? snap?.metaVendasDia ?? overrideData?.metaVendasDia ?? null,
        metaRecebimentosMinima: snap ? r2v((base * pctDe("metaPctRecebimentoMinima", 40)) / 100) : null,
        metaRecebimentosMedia: snap ? r2v((base * pctDe("metaPctRecebimentoMedia", 55)) / 100) : null,
        metaRecebimentosDia: snap ? r2v((base * pct) / 100) : null,
        metaRecuperacaoDia: snap?.metaRecuperacaoDia ?? null,
        metaValorVendasDia: snap?.metaValorVendasDia ?? null,
        metaRenovacaoMinima: snap?.metaRenovacaoMinima ?? null,
        metaRenovacaoMedia: snap?.metaRenovacaoMedia ?? null,
        metaRenovacaoDia: snap?.metaRenovacaoDia ?? null,
      };
    });
}
