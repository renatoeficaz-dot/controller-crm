// Lado do servidor da conciliação por OFX: grava o extrato, casa com os lançamentos, fecha as tarefas "Conferir pagamento" que o extrato
// comprovou e monta o estado da aba "Conciliação". As contas em si ficam em lib/conciliacaoOfx.js (puras, testadas).
import { prisma } from "@/lib/prisma";
import { lerOfx, conciliar, fecharCaixa, diaBRT, categoriaParecida } from "@/lib/conciliacaoOfx";

const DIA = 86400e3;
// A conciliação começa neste dia: antes dele ninguém cobra extrato (os dias anteriores foram desconsiderados). O extrato de teste de 07/11
// continua valendo porque foi enviado: o que um arquivo cobre sempre é conferido, a data só vale para os dias SEM extrato.
export const INICIO_CONCILIACAO = "2026-11-09";
const inicioDia = (dia) => new Date(`${dia}T00:00:00-03:00`);
const fimDia = (dia) => new Date(inicioDia(dia).getTime() + DIA);
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Lançamentos da conta no intervalo [ini, fim) que passam pelo banco: fora os de dinheiro em espécie (nunca aparecem no extrato).
async function lancamentosDoBanco(bancoId, ini, fim, extraWhere = {}) {
  // "Ajuste de saldo" é correção de caixa feita à mão: nunca passa pelo banco, então não entra na conferência.
  const lancs = await prisma.lancamento.findMany({
    where: { date: { gte: ini, lt: fim }, OR: [{ bancoId }, { bancoId: null }], NOT: { description: { startsWith: "Ajuste de saldo" } }, ...extraWhere },
    select: { id: true, type: true, amount: true, description: true, date: true, parcelaId: true, contactId: true, conciliadoEm: true, transferenciaId: true },
    orderBy: { date: "asc" },
  });
  const ids = [...new Set(lancs.map((l) => l.parcelaId).filter(Boolean))];
  const dinheiro = new Set();
  for (let i = 0; i < ids.length; i += 500) {
    const ps = await prisma.parcela.findMany({ where: { id: { in: ids.slice(i, i + 500) }, formaPagamento: "dinheiro" }, select: { id: true } });
    ps.forEach((p) => dinheiro.add(p.id));
  }
  const banco = [], especie = [];
  for (const l of lancs) (l.parcelaId && dinheiro.has(l.parcelaId) ? especie : banco).push(l);
  return { banco, especie };
}

// Casa os movimentos pendentes com os lançamentos ainda não conferidos. Devolve quantos casaram.
export async function rodarConciliacao(bancoId) {
  const pend = await prisma.extratoMovimento.findMany({ where: { bancoId, status: "pendente", lancamentoId: null } });
  if (!pend.length) return { casados: 0, tarefasFechadas: 0 };
  const tempos = pend.map((m) => m.data.getTime());
  const ini = inicioDia(diaBRT(new Date(Math.min(...tempos) - DIA)));
  const fim = fimDia(diaBRT(new Date(Math.max(...tempos) + DIA)));
  const { banco } = await lancamentosDoBanco(bancoId, ini, fim, { conciliadoEm: null });
  const r = conciliar(pend.map((m) => ({ id: m.id, data: m.data, valor: m.valor, tipo: m.tipo, descricao: m.descricao })), banco.map((l) => ({ ...l, data: l.date })));
  const agora = new Date();
  const porId = new Map(banco.map((l) => [l.id, l]));
  // Um movimento pode casar com vários lançamentos (a IA divide um Pix em pedaços): agrupa os pares por movimento.
  const grupos = new Map();
  for (const p of r.pares) { if (!grupos.has(p.movId)) grupos.set(p.movId, []); grupos.get(p.movId).push(p); }
  for (const [movId, ps] of grupos) {
    await prisma.$transaction([
      prisma.extratoMovimento.update({ where: { id: movId }, data: { status: "conciliado", lancamentoId: ps[0].lancId, lancamentoIds: ps.length > 1 ? ps.map((p) => p.lancId).join(",") : null, resolvidoEm: agora, resolvidoPor: "OFX", observacao: ps.length > 1 ? `Casado pela soma de ${ps.length} lançamentos` : null } }),
      prisma.lancamento.updateMany({ where: { id: { in: ps.map((p) => p.lancId) } }, data: { conciliadoEm: agora } }),
    ]);
  }
  const contatos = [...new Set(r.pares.map((p) => porId.get(p.lancId)?.contactId).filter(Boolean))];
  const tarefasFechadas = await fecharTarefasConferidas(contatos);
  return { casados: grupos.size, lancamentosCasados: r.pares.length, tarefasFechadas };
}

// Fecha a tarefa "Conferir pagamento do cliente ..." do contato quando TODAS as entradas de parcela dele nos últimos dias já bateram
// com o extrato (a tarefa pode juntar várias baixas; enquanto sobrar uma sem Pix, ela continua aberta).
export async function fecharTarefasConferidas(contactIds) {
  let fechadas = 0;
  const desde = new Date(Date.now() - 4 * DIA);
  for (const contactId of contactIds) {
    const tarefas = await prisma.task.findMany({ where: { contactId, done: false, title: { startsWith: "Conferir pagamento do cliente" }, createdAt: { gte: desde } }, select: { id: true } });
    if (!tarefas.length) continue;
    // Em dinheiro nunca aparece no extrato: não pode segurar a tarefa aberta.
    const abertos = await prisma.lancamento.findMany({ where: { contactId, type: "entrada", parcelaId: { not: null }, conciliadoEm: null, date: { gte: desde } }, select: { parcelaId: true } });
    const dinheiro = abertos.length ? await prisma.parcela.count({ where: { id: { in: abertos.map((l) => l.parcelaId) }, formaPagamento: "dinheiro" } }) : 0;
    if (abertos.length - dinheiro > 0) continue;
    await prisma.task.updateMany({ where: { id: { in: tarefas.map((t) => t.id) } }, data: { done: true } });
    fechadas += tarefas.length;
  }
  return fechadas;
}

// Importa um OFX: grava só os movimentos novos, concilia e registra o período/saldo do arquivo.
export async function importarOfx({ texto, arquivo, bancoId, usuario }) {
  const o = lerOfx(texto);
  if (!o.movimentos.length) throw new Error("O arquivo não tem nenhum movimento.");
  const existentes = new Set((await prisma.extratoMovimento.findMany({ where: { chave: { in: o.movimentos.map((m) => m.chave) } }, select: { chave: true } })).map((x) => x.chave));
  const novos = o.movimentos.filter((m) => !existentes.has(m.chave));
  const imp = await prisma.extratoImportacao.create({
    data: { bancoId, arquivo: arquivo || null, de: o.de, ate: o.ate, saldoFinal: o.saldo, saldoData: o.saldoData, qtdMov: o.movimentos.length, novos: novos.length, importadoPor: usuario || null },
  });
  if (novos.length) {
    await prisma.extratoMovimento.createMany({
      data: novos.map((m) => ({ chave: m.chave, bancoId, data: m.data, valor: m.valor, tipo: m.tipo, descricao: m.descricao || null, importacaoId: imp.id })),
    });
  }
  const conc = await rodarConciliacao(bancoId);
  await anotarTarefasSemExtrato(bancoId, o.de, o.ate);
  await prisma.auditLog.create({ data: { usuario: usuario || null, acao: "importar_ofx", entidade: "ExtratoImportacao", entidadeId: imp.id, detalhe: `${arquivo || "OFX"}: ${o.movimentos.length} movimentos (${novos.length} novos), ${conc.casados} casados` } }).catch(() => {});
  return { importacaoId: imp.id, total: o.movimentos.length, novos: novos.length, repetidos: o.movimentos.length - novos.length, ...conc, de: o.de, ate: o.ate };
}

// Baixa que não achou Pix no extrato: a tarefa "Conferir pagamento" dela continua aberta e ganha a explicação.
async function anotarTarefasSemExtrato(bancoId, de, ate) {
  const { banco } = await lancamentosDoBanco(bancoId, inicioDia(diaBRT(de)), fimDia(diaBRT(ate)), { conciliadoEm: null, type: "entrada", parcelaId: { not: null } });
  const contatos = [...new Set(banco.map((l) => l.contactId).filter(Boolean))];
  const nota = `Não achei esse pagamento no extrato (OFX de ${diaBRT(de).split("-").reverse().join("/")} a ${diaBRT(ate).split("-").reverse().join("/")}). Veja em Lançamentos › Conciliação.`;
  for (const contactId of contatos) {
    const ts = await prisma.task.findMany({ where: { contactId, done: false, title: { startsWith: "Conferir pagamento do cliente" } }, select: { id: true, notes: true } });
    for (const t of ts) if (!(t.notes || "").includes("Não achei esse pagamento no extrato")) await prisma.task.update({ where: { id: t.id }, data: { notes: [t.notes, nota].filter(Boolean).join("\n") } });
  }
}

// Estado completo da aba: pendências dos dois lados, fechamento do caixa e histórico de arquivos.
export async function estadoConciliacao(bancoId) {
  const imps = await prisma.extratoImportacao.findMany({ where: { bancoId }, orderBy: { createdAt: "desc" }, take: 15 });
  if (!imps.length) return { casadosPorSoma: [], semCobertura: [], importacoes: [], movPendentes: [], lancSemExtrato: [], especie: 0, caixa: null, resumo: { conciliados: 0, pendentes: 0, semExtrato: 0 } };
  const de = new Date(Math.min(...imps.map((i) => i.de.getTime())));
  const ate = new Date(Math.max(...imps.map((i) => i.ate.getTime())));
  const ini = inicioDia(diaBRT(de)), fim = fimDia(diaBRT(ate));
  const movs = await prisma.extratoMovimento.findMany({ where: { bancoId, data: { gte: ini, lt: fim } }, orderBy: { data: "asc" } });
  const { banco, especie } = await lancamentosDoBanco(bancoId, ini, fim);
  // Lançamento só entra em "sem extrato" se cair num dia coberto por algum arquivo.
  const cobertos = imps.map((i) => [inicioDia(diaBRT(i.de)).getTime(), fimDia(diaBRT(i.ate)).getTime()]);
  const coberto = (d) => cobertos.some(([a, b]) => d.getTime() >= a && d.getTime() < b);
  const lancSemExtrato = banco.filter((l) => !l.conciliadoEm && coberto(l.date));
  const contatos = new Map();
  const ids = [...new Set(lancSemExtrato.map((l) => l.contactId).filter(Boolean))];
  if (ids.length) (await prisma.contact.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).forEach((c) => contatos.set(c.id, c.name));
  // Categoria sugerida: a que o gestor já usou para o mesmo pagador/destino (e mesmo tipo) em extratos anteriores.
  const antigos = await prisma.extratoMovimento.findMany({ where: { bancoId, status: "lancado", lancamentoId: { not: null } }, select: { descricao: true, tipo: true, lancamentoId: true, resolvidoEm: true }, orderBy: { resolvidoEm: "desc" }, take: 800 });
  const catDe = new Map((await prisma.lancamento.findMany({ where: { id: { in: antigos.map((a) => a.lancamentoId) }, categoriaId: { not: null } }, select: { id: true, categoriaId: true } })).map((l) => [l.id, l.categoriaId]));
  const historico = { entrada: [], saida: [] };
  for (const a of antigos) if (catDe.has(a.lancamentoId)) historico[a.tipo]?.push({ descricao: a.descricao, categoriaId: catDe.get(a.lancamentoId) });
  // Dias com lançamento que passa pelo banco e que NENHUM extrato enviado cobre: o gestor precisa mandar o OFX desses dias.
  const olhar = new Date(Date.now() - 14 * DIA);
  const { banco: recentes } = await lancamentosDoBanco(bancoId, olhar, new Date(Date.now() + DIA), { conciliadoEm: null });
  const faltam = new Map();
  for (const l of recentes) {
    if (coberto(l.date) || diaBRT(l.date) < INICIO_CONCILIACAO) continue;
    const d = diaBRT(l.date);
    const g = faltam.get(d) || { dia: d, entradas: 0, saidas: 0, qtdEntradas: 0, qtdSaidas: 0 };
    if (l.type === "entrada") { g.entradas += l.amount; g.qtdEntradas++; } else { g.saidas += l.amount; g.qtdSaidas++; }
    faltam.set(d, g);
  }
  const semCobertura = [...faltam.values()].sort((a, b) => a.dia.localeCompare(b.dia)).map((g) => ({ ...g, entradas: r2(g.entradas), saidas: r2(g.saidas) }));
  // Pix casados pela SOMA de vários lançamentos: lista para o gestor revisar (a soma pode ter coincidido com os lançamentos errados).
  const porSoma = movs.filter((m) => m.status === "conciliado" && m.lancamentoIds);
  const idsSoma = [...new Set(porSoma.flatMap((m) => m.lancamentoIds.split(",")))];
  const lancSoma = idsSoma.length ? await prisma.lancamento.findMany({ where: { id: { in: idsSoma } }, select: { id: true, amount: true, description: true, date: true } }) : [];
  const lsMap = new Map(lancSoma.map((l) => [l.id, l]));
  const casadosPorSoma = porSoma.map((m) => ({ id: m.id, data: m.data, valor: m.valor, descricao: m.descricao, lancs: m.lancamentoIds.split(",").map((id) => lsMap.get(id)).filter(Boolean).map((l) => ({ id: l.id, amount: l.amount, description: l.description, date: l.date })) }));
  const ultima = imps[0];
  const saldoSistema = ultima.saldoData
    ? r2((await prisma.lancamento.findMany({ where: { date: { lte: ultima.saldoData }, OR: [{ bancoId }, { bancoId: null }] }, select: { type: true, amount: true, parcelaId: true } }))
        .reduce((s, l) => s + (l.type === "entrada" ? l.amount : -l.amount), 0)) - r2(especie.filter((l) => l.date <= ultima.saldoData).reduce((s, l) => s + (l.type === "entrada" ? l.amount : -l.amount), 0))
    : null;
  const caixa = fecharCaixa({
    movs: movs.filter((m) => m.status !== "ignorado"),
    lancs: banco,
    saldoExtrato: ultima.saldoFinal,
    saldoSistema,
  });
  return {
    casadosPorSoma,
    semCobertura,
    importacoes: imps.map((i) => ({ id: i.id, arquivo: i.arquivo, de: i.de, ate: i.ate, qtdMov: i.qtdMov, novos: i.novos, criadoEm: i.createdAt, por: i.importadoPor })),
    movPendentes: movs.filter((m) => m.status === "pendente").map((m) => ({ ...m, categoriaSugerida: categoriaParecida(m.descricao, historico[m.tipo] || []) })),
    lancSemExtrato: lancSemExtrato.map((l) => ({ id: l.id, type: l.type, amount: l.amount, description: l.description, date: l.date, contactId: l.contactId, contato: contatos.get(l.contactId) || null })),
    especie: especie.length,
    caixa: { ...caixa, saldoExtrato: ultima.saldoFinal, saldoSistema, saldoData: ultima.saldoData, periodo: { de, ate }, ignorados: movs.filter((m) => m.status === "ignorado").length },
    resumo: { conciliados: movs.filter((m) => m.status === "conciliado" || m.status === "lancado").length, pendentes: movs.filter((m) => m.status === "pendente").length, semExtrato: lancSemExtrato.length },
  };
}
