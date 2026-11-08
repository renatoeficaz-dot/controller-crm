// Como rodar (no servidor, dentro do container da aplicação; nada é gravado no banco de verdade):
//   1) cópia do banco:  VACUUM INTO '/tmp/ensaio.db'  (ex.: prisma.$executeRawUnsafe no container)
//   2) ensaio:          DATABASE_URL=file:/tmp/ensaio.db ENSAIO_DIAS=14 node --import ./tests/aliasRegister.mjs scripts/ensaio-carteira-real.mjs
//   3) apagar a cópia:  rm /tmp/ensaio.db*
// O script se recusa a rodar em qualquer banco que não seja /tmp/ensaio.db. Use antes de mexer em cálculo de metas/comissão.
// ENSAIO DOS PRÓXIMOS DIAS COM A CARTEIRA REAL — roda numa CÓPIA do banco de produção (nunca no banco de verdade).
// Parte do estado de hoje (clientes, etapas, parcelas reais a vencer) e avança o relógio dia a dia a partir de segunda-feira,
// com um operador aleatório (pagamentos, empréstimos novos, renovações, duplicatas, mudanças de etapa). Compara o sistema com um oráculo.
import { mock } from "node:test";
import assert from "node:assert/strict";

process.env.TZ = "America/Sao_Paulo";
const DIAS = Number(process.env.ENSAIO_DIAS || 14);
const SEMENTE = Number(process.env.ENSAIO_SEMENTE || 20261108);
const INICIO = process.env.ENSAIO_INICIO || "2026-11-09";

const { prisma } = await import("@/lib/prisma.js");
// Segurança: só escreve na cópia.
const bancos = await prisma.$queryRawUnsafe("PRAGMA database_list");
const arquivo = String(bancos[0]?.file || "");
if (!arquivo.endsWith("/tmp/ensaio.db")) { console.log("ABORTA: o ensaio só roda na cópia /tmp/ensaio.db, e o banco aberto é", arquivo); process.exit(1); }
console.log("banco do ensaio:", arquivo);

const M = await import("@/lib/metas.js");
const R = await import("@/lib/metasResumo.js");
const A = await import("@/lib/auditoriaMetas.js");
const { calcularComissaoMetas } = await import("@/lib/comissaoMetas.js");

function prng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rng = prng(SEMENTE);
const pick = (xs) => xs[Math.floor(rng() * xs.length)];
const pad = (n) => String(n).padStart(2, "0");
const brt = (dia, h = 0, m = 0, s = 0) => new Date(`${dia}T${pad(h)}:${pad(m)}:${pad(s)}-03:00`);
const diaBRT = (d) => new Date(d.getTime() - 3 * 3600e3).toISOString().slice(0, 10);
const horaBRT = (d) => new Date(d.getTime() - 3 * 3600e3).getUTCHours();
const dowDe = (dia) => new Date(dia + "T12:00:00Z").getUTCDay();
const somar = (dia, n) => new Date(new Date(dia + "T00:00:00Z").getTime() + n * 86400e3).toISOString().slice(0, 10);
const proxCobranca = (dia) => { let d = somar(dia, 1); if (dowDe(d) === 0) d = somar(d, 1); return d; };
const r2 = (n) => Math.round(n * 100) / 100;
const venc = (dia) => new Date(dia + "T00:00:00.000Z");
let checks = 0;
const perto = (a, b, msg) => { checks++; assert.ok(Math.abs((a || 0) - (b || 0)) <= 0.011, `${msg}: sistema ${a} ≠ esperado ${b}`); };
const eq = (a, b, msg) => { checks++; assert.equal(a, b, msg); };
const diaComissaoOr = (t) => { const d = diaBRT(t); return dowDe(d) === 6 && horaBRT(t) >= 17 ? somar(d, 2) : d; };
const inicioSemana = (dia) => { const w = dowDe(dia); return somar(dia, w === 0 ? -6 : 1 - w); };

/* ---------- estado inicial = o banco real ---------- */
const cfgDb = await prisma.config.findUnique({ where: { id: "singleton" } });
let cfg = { rec: [cfgDb.metaPctRecebimentoMinima, cfgDb.metaPctRecebimentoMedia, cfgDb.metaPctRecebimento], lib: [cfgDb.metaPctLiberacaoMinima, cfgDb.metaPctLiberacaoMedia, cfgDb.metaPctLiberacao] };
const HON = cfgDb.honorariosPct, HON15 = 120;
console.log("metas reais:", JSON.stringify(cfg), "honorários", HON);
const etapas = Object.fromEntries((await prisma.stage.findMany()).map((s) => [s.name, s.id]));
const dono = await prisma.user.findFirst({ where: { name: "Arthur trabalho" } });
const cfgCom = await prisma.comissaoMetasConfig.findUnique({ where: { userId: dono.id } });
const pctsCom = { minima: cfgCom.pctMinima, media: cfgCom.pctMedia, maxima: cfgCom.pctMaxima };

const contatos = new Map();
const reais = await prisma.contact.findMany({
  where: { excluidoEm: null, stage: { name: { in: ["Recebimento", "Pago", "Cravo", "Venda perdida", "Liberação pagamento"] } } },
  select: { id: true, cicloAtual: true, valorCapital: true, entrouRecebimentoEm: true, stage: { select: { name: true } }, parcelas: { where: { renegociada: false }, select: { id: true, number: true, ciclo: true, dueDate: true, amount: true, paid: true, valorPago: true } } },
});
for (const c of reais) {
  const ciclo = c.cicloAtual || 1;
  const longos = new Set(c.parcelas.filter((p) => p.number > 10 && p.number < 1000).map((p) => p.ciclo));
  contatos.set(c.id, {
    id: c.id, estado: c.stage.name, ciclo, capital: c.valorCapital || 0, entrouRec: c.entrouRecebimentoEm, real: true, longos,
    parcelas: c.parcelas.map((p) => ({ id: p.id, number: p.number, ciclo: p.ciclo || 1, dueDia: p.dueDate.toISOString().slice(0, 10), amount: p.amount, paid: p.paid, valorPago: p.valorPago })),
  });
}
console.log("contatos carregados:", contatos.size, "| em Recebimento:", [...contatos.values()].filter((c) => c.estado === "Recebimento").length, "| parcelas:", [...contatos.values()].reduce((s, c) => s + c.parcelas.length, 0));
const fatorCapital = (c, p) => 1 / (1 + (c.longos?.has(p.ciclo) ? HON15 : HON) / 100);

// Sábado anterior à simulação, depois das 17h (dinheiro REAL que a regra do corte joga na segunda do início): entra no oráculo.
const caixa = [], libs = [], duplicatas = [], lancBuf = [], logBuf = [], pendentes = [];
const sabadoAntes = somar(INICIO, -2);
{
  const de = brt(sabadoAntes, 17), ate = brt(somar(sabadoAntes, 1), 0);
  const ents = await prisma.lancamento.findMany({ where: { type: "entrada", parcelaId: { not: null }, createdAt: { gte: de, lt: ate } }, select: { amount: true, createdAt: true, parcelaId: true } });
  const ps = await prisma.parcela.findMany({ where: { id: { in: ents.map((e) => e.parcelaId) } }, select: { id: true, baixadoPor: true } });
  const quem = new Map(ps.map((p) => [p.id, p.baixadoPor]));
  for (const e of ents) caixa.push({ t: e.createdAt, v: e.amount, quem: quem.get(e.parcelaId), pid: e.parcelaId });
  const sai = await prisma.lancamento.findMany({ where: { type: "saida", description: { startsWith: "Liberação de capital" }, createdAt: { gte: de, lt: ate } }, select: { amount: true, createdAt: true, contactId: true } });
  for (const l of sai) libs.push({ t: l.createdAt, v: l.amount, contactId: l.contactId });
  console.log(`sábado ${sabadoAntes} depois das 17h (real): recebido ${r2(caixa.reduce((s, x) => s + x.v, 0))}, liberado ${r2(libs.reduce((s, x) => s + x.v, 0))} — vai para a segunda ${INICIO} na comissão`);
}

let nCont = 0, nParc = 0, nLanc = 0, nLog = 0;
const estadoInicio = new Map(), baseOr = new Map(), pctSnap = new Map(), novasDoDia = new Map();
let sistemaComissaoRec = 0;
let pagamentos = 0, novos = 0, renovacoes = 0;

async function flush() {
  while (lancBuf.length) await prisma.lancamento.createMany({ data: lancBuf.splice(0, 200) });
  while (logBuf.length) await prisma.etapaLog.createMany({ data: logBuf.splice(0, 200) });
}
const lancar = (c, p, tipo, valor, t, desc) => lancBuf.push({ id: "sl" + ++nLanc, type: tipo, amount: valor, description: desc, contactId: c.id, parcelaId: p?.id || null, createdAt: t });
async function mover(c, para, t) {
  const de = c.estado; c.estado = para;
  const dados = { stageId: etapas[para], entrouEtapaEm: t };
  if (para === "Recebimento" && !c.entrouRec) { c.entrouRec = t; dados.entrouRecebimentoEm = t; }
  if (para === "Pago") c.pagoEm = t;
  await prisma.contact.update({ where: { id: c.id }, data: dados });
  logBuf.push({ id: "se" + ++nLog, contactId: c.id, deEtapa: de, paraEtapa: para, createdAt: t });
}
async function atualizarParcela(p, dados) {
  Object.assign(p, { paid: dados.paid ?? p.paid, valorPago: dados.valorPago ?? p.valorPago });
  await prisma.parcela.update({ where: { id: p.id }, data: dados });
}
async function concluiSeQuitado(c, t) {
  const doCiclo = c.parcelas.filter((p) => p.ciclo === c.ciclo);
  if (c.estado === "Recebimento" && doCiclo.length && doCiclo.every((p) => p.paid)) await mover(c, "Pago", t);
}
async function entrar(c, p, v, t, quem) { lancar(c, p, "entrada", r2(v), t, "Baixa — ensaio"); caixa.push({ t, v: r2(v), quem, pid: p.id }); }
async function liberarNovo(D, h, renovacao, c0 = null) {
  const capital = pick([300, 400, 500]);
  let c = c0, T1;
  if (renovacao) {
    T1 = brt(D, h, 1 + Math.floor(rng() * 57));
    c.ciclo += 1; c.capital = capital; c.longos = new Set([...c.longos].filter((x) => x !== c.ciclo));
    const t0 = new Date(T1.getTime() - 60e3);
    await mover(c, "Liberação pagamento", t0);
    await prisma.contact.update({ where: { id: c.id }, data: { cicloAtual: c.ciclo, valorCapital: capital, renovadoEm: t0 } });
    renovacoes++;
  } else {
    T1 = brt(D, h, Math.floor(rng() * 59));
    c = { id: "sc" + ++nCont, estado: "Liberação pagamento", parcelas: [], ciclo: 1, capital, entrouRec: null, longos: new Set() };
    contatos.set(c.id, c);
    await prisma.contact.create({ data: { id: c.id, name: "Ensaio " + c.id, stageId: etapas["Liberação pagamento"], valorCapital: capital, responsavel: pick(["Ana", "Bia"]), cicloAtual: 1 } });
    logBuf.push({ id: "se" + ++nLog, contactId: c.id, deEtapa: null, paraEtapa: "Liberação pagamento", createdAt: brt(D, 8) });
    novos++;
  }
  const primeira = !c.entrouRec;
  await mover(c, "Recebimento", T1);
  if (primeira) { if (!novasDoDia.has(D)) novasDoDia.set(D, []); novasDoDia.get(D).push(c); }
  const valor = r2((capital * (1 + HON / 100)) / 10);
  const novas = []; let d = D;
  for (let i = 1; i <= 10; i++) { d = proxCobranca(d); const p = { id: "sp" + ++nParc, contactId: c.id, number: i, ciclo: c.ciclo, dueDia: d, amount: valor, paid: false, valorPago: 0 }; novas.push(p); c.parcelas.push(p); }
  await prisma.parcela.createMany({ data: novas.map((p) => ({ id: p.id, contactId: p.contactId, number: p.number, ciclo: p.ciclo, dueDate: venc(p.dueDia), amount: p.amount })) });
  lancar(c, null, "saida", capital, T1, "Liberação de capital — ensaio");
  libs.push({ t: T1, v: capital, contactId: c.id });
}
async function pagar(c, p, t) {
  pagamentos++;
  const D = diaBRT(t);
  const juros = p.dueDia < D ? r2(p.amount * 0.1) : 0;
  const total = r2(p.amount + juros);
  const quem = pick(["Ana", "Bia", "IA"]);
  const completar = (tt, vp) => atualizarParcela(p, { paid: true, paidAt: tt, amountPago: total, valorPago: vp, valorPagoEm: tt, baixadoPor: quem });
  const modo = rng();
  if (modo < 0.03) { caixa.push({ t, v: total, quem, pid: p.id }); await completar(t, total); }
  else if (modo < 0.14) {
    const a = r2(total * (0.3 + 0.4 * rng()));
    const t2 = new Date(Math.min(t.getTime() + (5 + Math.floor(rng() * 110)) * 60e3, brt(D, 23, 58).getTime()));
    await entrar(c, p, a, t, quem); await atualizarParcela(p, { paid: false, valorPago: a, valorPagoEm: t, baixadoPor: quem });
    await entrar(c, p, total - a, t2, quem); await completar(t2, total); await concluiSeQuitado(c, t2); return;
  } else if (modo < 0.19) {
    const a = r2(total * (0.3 + 0.4 * rng()));
    await entrar(c, p, a, t, quem); await atualizarParcela(p, { paid: false, valorPago: a, valorPagoEm: t, baixadoPor: quem });
    pendentes.push({ c, p, resto: r2(total - a), total, quem, dia: somar(D, 1 + Math.floor(rng() * 2)), hora: 8 + Math.floor(rng() * 12) }); return;
  } else if (modo < 0.32 && juros > 0) {
    await entrar(c, p, p.amount, t, quem); await entrar(c, p, juros, new Date(t.getTime() + 60e3), quem); await completar(new Date(t.getTime() + 60e3), total);
  } else {
    await entrar(c, p, total, t, quem); await completar(t, rng() < 0.5 ? total : 0);
    if (rng() < 0.07) { const td = new Date(t.getTime() + 60e3); lancar(c, p, "entrada", total, td, "Parcela — lançamento em dobro"); duplicatas.push({ t: td, parcelaId: p.id, v: total }); }
  }
  await concluiSeQuitado(c, t);
}
async function completarPendente(x, t) {
  const { c, p, resto, total, quem } = x;
  await entrar(c, p, resto, t, quem);
  await atualizarParcela(p, { paid: true, paidAt: t, amountPago: total, valorPago: total, valorPagoEm: t, baixadoPor: quem });
  await concluiSeQuitado(c, t);
}

const somaCaixa = (f) => r2(caixa.filter(f).reduce((s, x) => s + x.v, 0));
const somaLib = (f) => r2(libs.filter(f).reduce((s, x) => s + x.v, 0));
const banda = (v, a, b, c) => (c && v >= c ? "maxima" : b && v >= b ? "media" : a && v >= a ? "minima" : null);
const nivelOr = (v, a, b, c) => (!c ? null : v >= c ? "meta" : v >= b ? "media" : v >= a ? "minima" : "abaixo");
const pctRecDoDia = (d, hojeDia) => (d >= inicioSemana(hojeDia) ? cfg.rec : pctSnap.get(d) || cfg.rec);
function limiares(d, hojeDia) {
  const b = baseOr.get(d) || { total: 0, capital: 0 };
  const [pm, pd, px] = pctRecDoDia(d, hojeDia), [lm, ld, lx] = cfg.lib, fator = dowDe(d) === 6 ? 0.5 : 1;
  return { rec: [r2((b.total * pm) / 100), r2((b.total * pd) / 100), r2((b.total * px) / 100)], lib: [r2((b.capital * lm * fator) / 100), r2((b.capital * ld * fator) / 100), r2((b.capital * lx * fator) / 100)] };
}

async function verificarDia(D) {
  const real = await M.resultadoDoDia(D);
  perto(real.recebimentos, somaCaixa((x) => diaBRT(x.t) === D), `${D} recebido`);
  perto(real.valorRecebido, real.recebimentos, `${D} valorRecebido`);
  perto(real.liberado, somaLib((x) => diaBRT(x.t) === D), `${D} liberado`);
  eq(real.vendas, (novasDoDia.get(D) || []).filter((c) => c.estado !== "Venda perdida").length, `${D} vendas novas`);
  let soma = 0;
  for (const q of ["Ana", "Bia", "IA"]) { const x = (await M.resultadoDoDia(D, q)).recebimentos; perto(x, somaCaixa((e) => diaBRT(e.t) === D && e.quem === q), `${D} recebido de ${q}`); soma += x; }
  perto(soma, real.recebimentos, `${D} soma das pessoas`);
  const g = (await M.esperadoPorDia(D, D)).get(D) || { total: 0, capital: 0 };
  perto(g.total, baseOr.get(D)?.total || 0, `${D} base`);
  perto(g.capital, baseOr.get(D)?.capital || 0, `${D} capital que volta`);
  const lim = limiares(D, D), m = await M.metasDoDia(D);
  perto(m.metaRecebimentosMinima, lim.rec[0], `${D} meta rec. mínima`); perto(m.metaRecebimentosMedia, lim.rec[1], `${D} meta rec. média`); perto(m.metaRecebimentosDia, lim.rec[2], `${D} meta rec. cheia`);
  perto(m.metaLiberacaoMinima, lim.lib[0], `${D} meta lib. mínima`); perto(m.metaLiberacaoDia, lim.lib[2], `${D} meta lib. cheia`);
  const res = await R.resumoMetas(D);
  perto(res.baixasDetalhe.reduce((s, x) => s + x.valor, 0), real.recebimentos, `${D} lista de baixas`);
  perto((res.placar || []).reduce((s, x) => s + x.valorRecebido, 0), real.recebimentos, `${D} placar recebido`);
  perto((res.placar || []).reduce((s, x) => s + x.valorVendido, 0), real.liberado, `${D} placar liberado`);
  perto(res.liberacoesDetalhe.reduce((s, x) => s + x.valorCapital, 0), real.liberado, `${D} lista de liberações`);
  perto(res.liberadoNovo + res.liberadoRenovacao, real.liberado, `${D} novo + renovação`);
  eq(res.niveis.recebimentos, nivelOr(real.recebimentos, ...lim.rec), `${D} nível de recebimento`);
  eq(res.niveis.liberacao, nivelOr(real.liberado, ...lim.lib), `${D} nível de liberação`);
  const leve = await R.resumoMetas(D, null, null, { leve: true });
  for (const k of ["liberadoHoje", "recebimentosHoje", "metaRecebimentosMinima", "metaLiberacaoDia", "valorEsperadoDia"]) perto(leve[k], res[k], `${D} leve × completo (${k})`);
  assert.deepEqual(leve.niveis, res.niveis, `${D} níveis do resumo leve`);
  return real;
}
async function verificarSemana(D) {
  const serie = await M.serieDeDias(INICIO, D);
  for (const s of serie) {
    perto(s.recebimentos, somaCaixa((x) => diaBRT(x.t) === s.dia), `série ${s.dia} recebido`);
    perto(s.liberado, somaLib((x) => diaBRT(x.t) === s.dia), `série ${s.dia} liberado`);
    if (s.temMeta && dowDe(s.dia) !== 0) { const lim = limiares(s.dia, D); perto(s.metaRecebimentosMinima, lim.rec[0], `série ${s.dia} meta mínima rec.`); perto(s.metaLiberacaoMinima, lim.lib[0], `série ${s.dia} meta mínima lib.`); }
  }
  const c = await calcularComissaoMetas(dono.id, brt(D, 12));
  const seg = inicioSemana(D); let total = 0;
  for (let i = 0; i < 6; i++) {
    const d = somar(seg, i), det = c.detalhe.find((x) => x.dia === d);
    const rec = somaCaixa((x) => diaComissaoOr(x.t) === d), lib = somaLib((x) => diaComissaoOr(x.t) === d);
    const lim = limiares(d, D), fr = banda(rec, ...lim.rec), fl = banda(lib, ...lim.lib);
    const esperado = r2((rec * ((fr ? pctsCom[fr] : 0) + (fl ? pctsCom[fl] : 0))) / 100);
    perto(det.recebido, rec, `comissão ${d} recebido`); perto(det.liberado, lib, `comissão ${d} liberado`);
    eq(det.faixaRec, fr, `comissão ${d} faixa rec.`); eq(det.faixaLib, fl, `comissão ${d} faixa lib.`); perto(det.comissao, esperado, `comissão ${d}`);
    sistemaComissaoRec += det.recebido; total += esperado;
  }
  perto(c.totalSemana, r2(total), `comissão da semana de ${seg}`);
  console.log(`  semana ${seg}: comissão do Arthur (simulada) R$ ${c.totalSemana} — recebido ${r2(seg ? [0, 1, 2, 3, 4, 5].reduce((s, i) => s + c.detalhe[i].recebido, 0) : 0)}`);
}

/* ---------- o ensaio ---------- */
mock.timers.enable({ apis: ["Date"], now: brt(INICIO, 0) });
const t0 = Date.now();
let alertasDup = 0;
for (let n = 0; n < DIAS; n++) {
  const D = somar(INICIO, n), domingo = dowDe(D) === 0;
  estadoInicio.set(D, new Set([...contatos.values()].filter((c) => c.estado === "Recebimento").map((c) => c.id)));
  let total = 0, capital = 0;
  for (const id of estadoInicio.get(D)) { const c = contatos.get(id); for (const p of c.parcelas) if (p.dueDia === D) { total += p.amount; capital += p.amount * fatorCapital(c, p); } }
  baseOr.set(D, { total: r2(total), capital });
  for (let h = 6; h <= 23; h++) {
    mock.timers.setTime(brt(D, h, 30).getTime());
    for (const x of pendentes.filter((q) => q.dia === D && q.hora === h)) { await completarPendente(x, brt(D, h, 10 + Math.floor(rng() * 40))); x.feito = true; }
    for (let i = pendentes.length - 1; i >= 0; i--) if (pendentes[i].feito) pendentes.splice(i, 1);
    if (!domingo && h >= 9 && h <= 16 && rng() < 0.3) await liberarNovo(D, h, false);
    if (!domingo && h === 11) for (const c of [...contatos.values()].filter((x) => x.estado === "Pago" && (!x.pagoEm || x.pagoEm <= brt(D, 11, 0)))) if (rng() < 0.05) await liberarNovo(D, h, true, c);
    for (const c of [...contatos.values()].filter((x) => x.estado === "Recebimento")) {
      const p = c.parcelas.find((q) => !q.paid && q.valorPago === 0 && q.dueDia <= D && q.ciclo === c.ciclo && !pendentes.some((z) => z.p === q));
      if (p && rng() < (domingo ? 0.02 : 0.06)) await pagar(c, p, brt(D, h, Math.floor(rng() * 58), Math.floor(rng() * 59)));
    }
    if (h === 10) for (const c of [...contatos.values()].filter((x) => x.estado === "Recebimento")) { if (c.parcelas.filter((q) => !q.paid && q.dueDia < D).length >= 3 && rng() < 0.08) await mover(c, "Cravo", brt(D, 10, 20)); }
    if (h === 15 && !domingo) for (const c of [...contatos.values()].filter((x) => x.estado === "Recebimento")) if (rng() < 0.004) await mover(c, "Venda perdida", brt(D, 15, 40));
    await flush();
    const dupsHora = duplicatas.filter((x) => !x.avisada && diaBRT(x.t) === D && horaBRT(x.t) === h);
    if (dupsHora.length) {
      mock.timers.setTime(brt(D, h, 59).getTime());
      const novosAv = await A.checarConsistenciaMetas();
      eq(novosAv, dupsHora.length, `${D} ${h}h: a conferência devia avisar ${dupsHora.length} caixa(s) em dobro`);
      for (const x of dupsHora) x.avisada = true; alertasDup += dupsHora.length;
    }
  }
  mock.timers.setTime(brt(D, 23, 59, 30).getTime());
  await M.registrarMetaDoDia();
  pctSnap.set(D, [...cfg.rec]);
  const r = await verificarDia(D);
  console.log(`${D} (${["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][dowDe(D)]}): base R$ ${baseOr.get(D).total} | recebido R$ ${r.recebimentos} (${baseOr.get(D).total ? Math.round((r.recebimentos / baseOr.get(D).total) * 100) : 0}%) | liberado R$ ${r.liberado} | ok`);
  if (dowDe(D) === 6) { await verificarSemana(D); eq(await A.checarConsistenciaMetas(), 0, `${D}: sem novas divergências entre telas`); }
}
// base de cada dia estável no fim, apesar de tudo que mudou depois
for (let n = 0; n < DIAS; n++) { const D = somar(INICIO, n); const g = (await M.esperadoPorDia(D, D)).get(D) || { total: 0 }; perto(g.total, baseOr.get(D).total, `base de ${D} estável no fim do ensaio`); }
mock.timers.reset();
console.log(`ENSAIO CONCLUÍDO: ${DIAS} dias a partir de ${INICIO} com a carteira real (${[...contatos.values()].filter((c) => c.real).length} clientes reais + ${novos} novos, ${renovacoes} renovações, ${pagamentos} pagamentos simulados, ${duplicatas.length} lançamentos em dobro injetados e ${alertasDup} avisados): ${checks} checagens, 0 divergências, ${Math.round((Date.now() - t0) / 1000)} s`);
await prisma.$disconnect();
process.exit(0);
