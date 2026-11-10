// Simulação de semanas FUTURAS de operação (virada de mês, de ano, sábado 17h, domingo, mudança de meta no meio da semana, caixa em dobro...).
// Um "operador" aleatório (semente fixa) gera empréstimos, pagamentos (inteiros, parciais em 1 ou 2 dias, com juros, sem lançamento), duplicatas
// de caixa, mudanças de etapa e renovações; o relógio é simulado. Para cada dia o teste compara o que o sistema calcula com um ORÁCULO
// independente (a verdade conhecida pela construção): recebido, liberado, base da meta, faixas, listas, placar, séries, comissão e conferência.
//   Rodar: npm test   |   mais fundo: SIM_SEMANAS=14 SIM_SEMENTE=7 npm test
import test, { after, before, mock } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

process.env.TZ = "America/Sao_Paulo";
const SEMANAS = Number(process.env.SIM_SEMANAS || 5);
const SEMENTE = Number(process.env.SIM_SEMENTE || 20261109);
const INICIO = "2026-11-09"; // segunda-feira

const pasta = mkdtempSync(join(tmpdir(), "controller-metas-sim-"));
writeFileSync(join(pasta, "teste.db"), "");
const url = `file:${join(pasta, "teste.db").replaceAll("\\", "/")}`;
process.env.DATABASE_URL = url;
const preparar = spawnSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "db", "push", "--skip-generate"], { env: { ...process.env, DATABASE_URL: url }, encoding: "utf8" });
assert.equal(preparar.status, 0, preparar.stderr);

const { prisma } = await import("../lib/prisma.js");
const M = await import("../lib/metas.js");
const R = await import("../lib/metasResumo.js");
const A = await import("../lib/auditoriaMetas.js");
const { calcularComissaoMetas } = await import("../lib/comissaoMetas.js");

/* ------------------------------ utilidades ------------------------------ */
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
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
const perto = (a, b, msg) => assert.ok(Math.abs((a || 0) - (b || 0)) <= 0.011, `${msg}: sistema ${a} ≠ esperado ${b} (semente ${SEMENTE})`);
// Dia de COMISSÃO do VALOR recebido (oráculo independente do código): sábado a partir das 17h e domingo contam na segunda seguinte.
// A meta (%) e o liberado usam o dia do calendário.
const diaComissaoOr = (t) => { const d = diaBRT(t); if (dowDe(d) === 0) return somar(d, 1); return dowDe(d) === 6 && horaBRT(t) >= 17 ? somar(d, 2) : d; };
const inicioSemana = (dia) => { const w = dowDe(dia); return somar(dia, w === 0 ? -6 : 1 - w); };

/* ------------------------------ estado e oráculo ------------------------------ */
const etapas = {};
let nCont = 0, nParc = 0, nLanc = 0, nLog = 0, ordem = 0;
const contatos = new Map();
const caixa = []; // dinheiro de verdade que entrou: { t, v, quem }
const libs = []; // capital de verdade que saiu: { t, v, contactId }
const duplicatas = []; // lançamentos em dobro injetados (não são dinheiro): { t, parcelaId, v }
const lancBuf = [];
const logBuf = [];
const pendentes = []; // pagamentos que completam em outro dia
const especiais = []; // pagamentos em horários de fronteira
const estadoInicio = new Map(); // dia -> Set de contatos em Recebimento às 00:00
const baseOr = new Map(); // dia -> { total, capital }
const pctSnap = new Map(); // dia -> % de recebimento gravadas no retrato do dia
let cfg = { rec: [50, 70, 100], lib: [80, 100, 120] };
let sistemaComissaoRec = 0; // soma, semana a semana, do recebido que o SISTEMA atribuiu aos dias de comissão
const novasDoDia = new Map(); // dia -> contatos que entraram em Recebimento (1ª vez) nesse dia

async function flush() {
  while (lancBuf.length) await prisma.lancamento.createMany({ data: lancBuf.splice(0, 200) });
  while (logBuf.length) await prisma.etapaLog.createMany({ data: logBuf.splice(0, 200) });
}
function lancar(c, p, tipo, valor, t, desc) {
  lancBuf.push({ id: "l" + ++nLanc, type: tipo, amount: valor, description: desc, contactId: c.id, parcelaId: p?.id || null, createdAt: t });
}
async function mover(c, para, t, { semLog = false } = {}) {
  const de = c.estado;
  c.estado = para;
  const dados = { stageId: etapas[para], entrouEtapaEm: t };
  if (para === "Recebimento" && !c.entrouRec) { c.entrouRec = t; dados.entrouRecebimentoEm = t; }
  if (para === "Pago") c.pagoEm = t;
  await prisma.contact.update({ where: { id: c.id }, data: dados });
  if (!semLog) logBuf.push({ id: "e" + ++nLog, contactId: c.id, deEtapa: de, paraEtapa: para, createdAt: t });
}

/* ------------------------------ operações do "mundo" ------------------------------ */
async function novoContato(D, capital) {
  const c = { id: "c" + ++nCont, estado: "Liberação pagamento", parcelas: [], ciclo: 1, capital, entrouRec: null };
  contatos.set(c.id, c);
  await prisma.contact.create({ data: { id: c.id, name: "Cliente " + c.id, stageId: etapas["Liberação pagamento"], valorCapital: capital, responsavel: pick(["Ana", "Bia"]), cicloAtual: 1 } });
  logBuf.push({ id: "e" + ++nLog, contactId: c.id, deEtapa: null, paraEtapa: "Liberação pagamento", createdAt: brt(D, 8) });
  return c;
}
async function liberar(c, D, T1, capital, { renovacao = false } = {}) {
  if (renovacao) {
    c.ciclo += 1;
    c.capital = capital;
    // um minuto antes de ir pra Recebimento: o histórico precisa seguir a ordem real dos fatos (quitou → renovou → recebendo)
    const t0 = new Date(T1.getTime() - 60e3);
    await mover(c, "Liberação pagamento", t0);
    await prisma.contact.update({ where: { id: c.id }, data: { cicloAtual: c.ciclo, valorCapital: capital, renovadoEm: t0 } });
  }
  const primeira = !c.entrouRec;
  await mover(c, "Recebimento", T1);
  if (primeira) { if (!novasDoDia.has(D)) novasDoDia.set(D, []); novasDoDia.get(D).push(c); }
  const valor = r2((capital * 1.8) / 10);
  const novas = [];
  let d = D;
  for (let i = 1; i <= 10; i++) {
    d = proxCobranca(d);
    const p = { id: "p" + ++nParc, contactId: c.id, number: i, ciclo: c.ciclo, dueDia: d, amount: valor, paid: false, valorPago: 0 };
    novas.push(p);
    c.parcelas.push(p);
  }
  await prisma.parcela.createMany({ data: novas.map((p) => ({ id: p.id, contactId: p.contactId, number: p.number, ciclo: p.ciclo, dueDate: venc(p.dueDia), amount: p.amount })) });
  lancar(c, null, "saida", capital, T1, "Liberação de capital — sim");
  libs.push({ t: T1, v: capital, contactId: c.id });
}
async function atualizarParcela(p, dados) {
  Object.assign(p, { paid: dados.paid ?? p.paid, valorPago: dados.valorPago ?? p.valorPago });
  await prisma.parcela.update({ where: { id: p.id }, data: dados });
}
async function concluiSeQuitado(c, t) {
  const doCiclo = c.parcelas.filter((p) => p.ciclo === c.ciclo);
  if (c.estado === "Recebimento" && doCiclo.every((p) => p.paid)) await mover(c, "Pago", t);
}
// Pagamento (ou parte dele) de uma parcela, com o dinheiro de verdade registrado no oráculo.
async function entrar(c, p, v, t, quem, desc = "Baixa — sim") {
  lancar(c, p, "entrada", r2(v), t, desc);
  caixa.push({ t, v: r2(v), quem, pid: p.id });
}
async function pagar(c, p, t) {
  const D = diaBRT(t);
  const juros = p.dueDia < D ? r2(p.amount * 0.1) : 0;
  const total = r2(p.amount + juros);
  const quem = pick(["Ana", "Bia", "IA"]);
  const completar = (tt, vp) => atualizarParcela(p, { paid: true, paidAt: tt, amountPago: total, valorPago: vp, valorPagoEm: tt, baixadoPor: quem });
  const modo = rng();
  if (modo < 0.03) {
    // baixa antiga, sem nenhum lançamento: entra pelo valor da parcela no dia da baixa
    caixa.push({ t, v: total, quem, pid: p.id });
    await completar(t, total);
  } else if (modo < 0.14) {
    // parcial agora e o resto minutos depois (mesmo dia)
    const a = r2(total * (0.3 + 0.4 * rng()));
    const t2 = new Date(Math.min(t.getTime() + (5 + Math.floor(rng() * 110)) * 60e3, brt(D, 23, 58).getTime()));
    await entrar(c, p, a, t, quem);
    await atualizarParcela(p, { paid: false, valorPago: a, valorPagoEm: t, baixadoPor: quem });
    await entrar(c, p, total - a, t2, quem);
    await completar(t2, total);
    await concluiSeQuitado(c, t2);
    return;
  } else if (modo < 0.19) {
    // parcial hoje e o resto em outro dia
    const a = r2(total * (0.3 + 0.4 * rng()));
    await entrar(c, p, a, t, quem);
    await atualizarParcela(p, { paid: false, valorPago: a, valorPagoEm: t, baixadoPor: quem });
    pendentes.push({ c, p, resto: r2(total - a), total, quem, dia: somar(D, 1 + Math.floor(rng() * 2)), hora: 8 + Math.floor(rng() * 12) });
    return;
  } else if (modo < 0.32 && juros > 0) {
    // principal e juros em lançamentos separados
    await entrar(c, p, p.amount, t, quem);
    await entrar(c, p, juros, new Date(t.getTime() + 60e3), quem);
    await completar(new Date(t.getTime() + 60e3), total);
  } else {
    await entrar(c, p, total, t, quem);
    await completar(t, rng() < 0.5 ? total : 0); // baixa parcial grava valorPago; a baixa normal deixa 0
    if (rng() < 0.07) {
      // o bug de caixa em dobro: o mesmo valor lançado de novo um minuto depois (NÃO é dinheiro)
      const td = new Date(t.getTime() + 60e3);
      lancar(c, p, "entrada", total, td, "Parcela — lançamento em dobro");
      duplicatas.push({ t: td, parcelaId: p.id, v: total });
    }
  }
  await concluiSeQuitado(c, t);
}
async function completarPendente(x, t) {
  const { c, p, resto, total, quem } = x;
  await entrar(c, p, resto, t, quem);
  await atualizarParcela(p, { paid: true, paidAt: t, amountPago: total, valorPago: total, valorPagoEm: t, baixadoPor: quem });
  await concluiSeQuitado(c, t);
}

/* ------------------------------ verificações (oráculo × sistema) ------------------------------ */
const somaCaixa = (f) => r2(caixa.filter(f).reduce((s, x) => s + x.v, 0));
const somaLib = (f) => r2(libs.filter(f).reduce((s, x) => s + x.v, 0));
const banda = (v, a, b, c) => (c && v >= c ? "maxima" : b && v >= b ? "media" : a && v >= a ? "minima" : null);
const nivelOr = (v, a, b, c) => (!c ? null : v >= c ? "meta" : v >= b ? "media" : v >= a ? "minima" : "abaixo");
function pctRecDoDia(d, hojeDia) {
  // semana em andamento: config de agora; semanas fechadas: o que o retrato do dia gravou
  return d >= inicioSemana(hojeDia) ? cfg.rec : pctSnap.get(d) || cfg.rec;
}
function limiares(d, hojeDia) {
  const b = baseOr.get(d) || { total: 0, capital: 0 };
  const [pm, pd, px] = pctRecDoDia(d, hojeDia);
  const [lm, ld, lx] = cfg.lib;
  const fator = dowDe(d) === 6 ? 0.5 : 1;
  return {
    rec: [r2((b.total * pm) / 100), r2((b.total * pd) / 100), r2((b.total * px) / 100)],
    lib: [r2((b.capital * lm * fator) / 100), r2((b.capital * ld * fator) / 100), r2((b.capital * lx * fator) / 100)],
  };
}

async function diagnostico(D) {
  const { itens } = await M.recebidosNoPeriodo(D, D);
  const sis = new Map(itens.map((i) => [i.id, i.valor]));
  const verdade = new Map();
  for (const x of caixa.filter((e) => diaBRT(e.t) === D)) verdade.set(x.pid, r2((verdade.get(x.pid) || 0) + x.v));
  const dif = [];
  for (const pid of new Set([...sis.keys(), ...verdade.keys()])) if (Math.abs((sis.get(pid) || 0) - (verdade.get(pid) || 0)) > 0.011) dif.push(`${pid}: verdade ${verdade.get(pid) || 0} sistema ${sis.get(pid) || 0}`);
  console.log(`DIAGNÓSTICO ${D}: parcelas que divergem da verdade:`, dif);
}

async function diagnosticoBase(D) {
  const inicio = brt(D, 0);
  const noOraculo = estadoInicio.get(D);
  for (const c of contatos.values()) {
    const devidas = c.parcelas.filter((p) => p.dueDia === D);
    if (!devidas.length) continue;
    const logs = await prisma.etapaLog.findMany({ where: { contactId: c.id }, orderBy: { createdAt: "asc" }, select: { deEtapa: true, paraEtapa: true, createdAt: true } });
    let atual = logs.length ? logs[0].deEtapa : null;
    for (const l of logs) { if (l.createdAt <= inicio) atual = l.paraEtapa; else break; }
    const oraculo = noOraculo.has(c.id);
    const sistema = atual === "Recebimento" || (!logs.length && c.estado === "Recebimento");
    if (oraculo !== sistema) console.log(`DIAGNÓSTICO BASE ${D}: ${c.id} oráculo=${oraculo} histórico=${atual} estadoAgora=${c.estado} ciclo=${c.ciclo} logs:`, logs.map((l) => `${l.createdAt.toISOString()} ${l.deEtapa}→${l.paraEtapa}`));
  }
}

async function verificarDia(D, rotulo) {
  const real = await M.resultadoDoDia(D);
  if (Math.abs(real.recebimentos - somaCaixa((x) => diaBRT(x.t) === D)) > 0.011) await diagnostico(D);
  perto(real.recebimentos, somaCaixa((x) => diaBRT(x.t) === D), `${rotulo} recebido`);
  perto(real.valorRecebido, real.recebimentos, `${rotulo} valorRecebido = recebimentos`);
  perto(real.liberado, somaLib((x) => diaBRT(x.t) === D), `${rotulo} liberado`);
  const vendasOr = (novasDoDia.get(D) || []).filter((c) => c.estado !== "Venda perdida");
  assert.equal(real.vendas, vendasOr.length, `${rotulo} nº de vendas novas (semente ${SEMENTE})`);

  // por pessoa: a soma das pessoas é o total
  let soma = 0;
  for (const q of ["Ana", "Bia", "IA"]) {
    const x = (await M.resultadoDoDia(D, q)).recebimentos;
    perto(x, somaCaixa((e) => diaBRT(e.t) === D && e.quem === q), `${rotulo} recebido de ${q}`);
    soma += x;
  }
  perto(soma, real.recebimentos, `${rotulo} soma das pessoas`);

  // base e metas do dia
  const g = (await M.esperadoPorDia(D, D)).get(D) || { total: 0, capital: 0 };
  if (Math.abs(g.total - (baseOr.get(D)?.total || 0)) > 0.011) await diagnosticoBase(D);
  perto(g.total, baseOr.get(D)?.total || 0, `${rotulo} base`);
  perto(g.capital, baseOr.get(D)?.capital || 0, `${rotulo} capital que volta`);
  const lim = limiares(D, D);
  const m = await M.metasDoDia(D);
  perto(m.metaRecebimentosMinima, lim.rec[0], `${rotulo} meta recebimento mínima`);
  perto(m.metaRecebimentosMedia, lim.rec[1], `${rotulo} meta recebimento média`);
  perto(m.metaRecebimentosDia, lim.rec[2], `${rotulo} meta recebimento cheia`);
  perto(m.metaLiberacaoMinima, lim.lib[0], `${rotulo} meta liberação mínima`);
  perto(m.metaLiberacaoDia, lim.lib[2], `${rotulo} meta liberação cheia (sábado vale a metade)`);

  // tela de Metas completa: listas, placar, novo+renovação, níveis, mês
  const res = await R.resumoMetas(D);
  assert.equal(res.dia, D);
  perto(res.baixasDetalhe.reduce((s, x) => s + x.valor, 0), real.recebimentos, `${rotulo} lista de baixas`);
  perto((res.placar || []).reduce((s, x) => s + x.valorRecebido, 0), real.recebimentos, `${rotulo} placar recebido`);
  perto((res.placar || []).reduce((s, x) => s + x.valorVendido, 0), real.liberado, `${rotulo} placar liberado`);
  perto(res.liberacoesDetalhe.reduce((s, x) => s + x.valorCapital, 0), real.liberado, `${rotulo} lista de liberações`);
  perto(res.liberadoNovo + res.liberadoRenovacao, real.liberado, `${rotulo} novo + renovação`);
  const novoOr = r2(libs.filter((x) => diaBRT(x.t) === D && contatos.get(x.contactId).entrouRec && diaBRT(contatos.get(x.contactId).entrouRec) === D).reduce((s, x) => s + x.v, 0));
  perto(res.liberadoNovo, novoOr, `${rotulo} liberado em venda nova`);
  assert.equal(res.niveis.recebimentos, nivelOr(real.recebimentos, ...lim.rec), `${rotulo} nível de recebimento (semente ${SEMENTE})`);
  assert.equal(res.niveis.liberacao, nivelOr(real.liberado, ...lim.lib), `${rotulo} nível de liberação (semente ${SEMENTE})`);
  const leve = await R.resumoMetas(D, null, null, { leve: true });
  for (const k of ["liberadoHoje", "recebimentosHoje", "metaRecebimentosMinima", "metaRecebimentosDia", "metaLiberacaoMinima", "metaLiberacaoDia", "valorEsperadoDia"]) perto(leve[k], res[k], `${rotulo} resumo leve × completo (${k})`);
  assert.deepEqual(leve.niveis, res.niveis, `${rotulo} níveis do resumo leve`);

  // acumulado do mês (domingo não tem meta; recebimento só dos dias com retrato)
  const diasMes = M.diasDoMes(D).filter((d) => d <= D);
  const uteis = diasMes.filter((d) => dowDe(d) !== 0);
  const metaLibMes = r2(uteis.reduce((s, d) => s + limiares(d, D).lib[2], 0));
  const libUteis = r2(uteis.reduce((s, d) => s + somaLib((x) => diaBRT(x.t) === d), 0));
  perto(res.mes.metaLiberacao, metaLibMes, `${rotulo} meta de liberação do mês`);
  perto(res.mes.liberadoUteis, libUteis, `${rotulo} liberado em dias úteis`);
  if (metaLibMes > 0) assert.equal(res.mes.pctLiberacao, Math.round((libUteis / metaLibMes) * 100), `${rotulo} % de liberação do mês`);
  const comMeta = uteis.filter((d) => pctSnap.has(d));
  const metaRecMes = r2(comMeta.reduce((s, d) => s + limiares(d, D).rec[2], 0));
  perto(res.mes.metaRecebimentos, metaRecMes, `${rotulo} meta de recebimento do mês`);
  const recComMeta = r2(comMeta.reduce((s, d) => s + somaCaixa((x) => diaBRT(x.t) === d), 0));
  perto(res.mes.recebimentosComMeta, recComMeta, `${rotulo} recebido dos dias com meta`);
  if (metaRecMes > 0) assert.equal(res.mes.pctRecebimentos, Math.round((recComMeta / metaRecMes) * 100), `${rotulo} % de recebimento do mês`);
  return real;
}

async function verificarSemana(D, userId) {
  // no sábado à noite: série de toda a simulação × oráculo, e a comissão da semana
  const ini = INICIO;
  const serie = await M.serieDeDias(ini, D);
  for (const s of serie) {
    perto(s.recebimentos, somaCaixa((x) => diaBRT(x.t) === s.dia), `série ${s.dia} recebido`);
    perto(s.liberado, somaLib((x) => diaBRT(x.t) === s.dia), `série ${s.dia} liberado`);
    if (s.temMeta && dowDe(s.dia) !== 0) {
      const lim = limiares(s.dia, D);
      perto(s.metaRecebimentosMinima, lim.rec[0], `série ${s.dia} meta mínima de recebimento`);
      perto(s.metaRecebimentosDia, lim.rec[2], `série ${s.dia} meta cheia de recebimento`);
      perto(s.metaLiberacaoMinima, lim.lib[0], `série ${s.dia} meta mínima de liberação`);
    }
  }
  // A mesma série em janelas diferentes dá o mesmo número (o bug antigo jogava o caixa da janela no último dia).
  const curta = await M.serieDeDias(somar(D, -6), D);
  for (const s of curta) {
    const longa = serie.find((x) => x.dia === s.dia);
    if (longa) perto(s.recebimentos, longa.recebimentos, `série curta × longa em ${s.dia}`);
  }

  const c = await calcularComissaoMetas(userId, brt(D, 12));
  const seg = inicioSemana(D);
  const pcts = { minima: 1, media: 2, maxima: 3 };
  let total = 0;
  for (let i = 0; i < 6; i++) {
    const d = somar(seg, i);
    const det = c.detalhe.find((x) => x.dia === d);
    const rec = somaCaixa((x) => diaComissaoOr(x.t) === d); // valor
    const recDia = somaCaixa((x) => diaBRT(x.t) === d); // decide a faixa
    const lib = somaLib((x) => diaBRT(x.t) === d);
    const lim = limiares(d, D);
    const fr = banda(recDia, ...lim.rec);
    const fl = banda(lib, ...lim.lib);
    const esperado = r2((rec * ((fr ? pcts[fr] : 0) + (fl ? pcts[fl] : 0))) / 100);
    perto(det.recebido, rec, `comissão ${d} valor recebido (dia de comissão)`);
    perto(det.recebidoDia, recDia, `comissão ${d} recebido do dia (meta)`);
    perto(det.liberado, lib, `comissão ${d} liberado do dia`);
    assert.equal(det.faixaRec, fr, `comissão ${d} faixa de recebimento (semente ${SEMENTE})`);
    assert.equal(det.faixaLib, fl, `comissão ${d} faixa de liberação (semente ${SEMENTE})`);
    perto(det.comissao, esperado, `comissão ${d}`);
    perto(det.ajusteRec, rec - recDia, `comissão ${d} ajuste sábado/domingo`);
    sistemaComissaoRec += det.recebido;
    total += esperado;
  }
  perto(c.totalSemana, r2(total), `comissão da semana de ${seg}`);
}

/* ------------------------------ a simulação ------------------------------ */
before(async () => {
  await prisma.config.create({
    data: {
      id: "singleton", honorariosPct: 80,
      metaPctRecebimentoMinima: 50, metaPctRecebimentoMedia: 70, metaPctRecebimento: 100,
      metaPctLiberacaoMinima: 80, metaPctLiberacaoMedia: 100, metaPctLiberacao: 120,
    },
  });
  for (const n of ["Liberação pagamento", "Recebimento", "Pago", "Cravo", "Venda perdida"]) etapas[n] = (await prisma.stage.create({ data: { name: n, order: ++ordem } })).id;
});
after(async () => {
  mock.timers.reset();
  await prisma.$disconnect();
});

test(`simulação de ${SEMANAS} semanas a partir de ${INICIO}: o sistema bate com o oráculo em todos os dias`, async () => {
  mock.timers.enable({ apis: ["Date"], now: brt(INICIO, 0) });
  const dono = await prisma.user.create({ data: { name: "Comissionado", login: "comissionado", passwordHash: "x", role: "admin" } });
  await prisma.comissaoMetasConfig.create({ data: { userId: dono.id, desde: venc(INICIO), pctMinima: 1, pctMedia: 2, pctMaxima: 3 } });

  // Carteira inicial: 25 clientes liberados no sábado anterior (a 1ª parcela vence na segunda do início; nada vence antes da simulação).
  const vespera = somar(INICIO, -2);
  for (let i = 0; i < 25; i++) {
    const c = await novoContato(vespera, pick([300, 400, 500]));
    await liberar(c, vespera, brt(vespera, 10), c.capital);
  }
  libs.length = 0; // o capital da carteira inicial saiu antes da simulação; novasDoDia também não conta
  novasDoDia.clear();
  lancBuf.length = 0;
  await prisma.lancamento.deleteMany({});

  // Contato de fronteira: pagamentos em 23:59:59 / 00:00:00 / 16:59:59 / 17:00:00 / domingo 23:59:59 / segunda 00:00:00 (BRT).
  const fr = await novoContato(vespera, 300);
  fr.especial = true; // só paga nos horários de fronteira (fora do fluxo aleatório de pagamentos)
  await mover(fr, "Recebimento", brt(vespera, 9));
  const sexta = "2026-11-13", sab = "2026-11-14", dom = "2026-11-15", seg2 = "2026-11-16";
  const fronteira = [
    [sexta, brt(sexta, 23, 59, 59), 10], [sab, brt(sab, 0, 0, 0), 11], [sab, brt(sab, 16, 59, 59), 12],
    [sab, brt(sab, 17, 0, 0), 13], [dom, brt(dom, 23, 59, 59), 14], [seg2, brt(seg2, 0, 0, 0), 15],
  ];
  for (const [i, [dueDia, t, v]] of fronteira.entries()) {
    const p = { id: "p" + ++nParc, contactId: fr.id, number: i + 1, ciclo: 1, dueDia, amount: v, paid: false, valorPago: 0 };
    fr.parcelas.push(p);
    await prisma.parcela.create({ data: { id: p.id, contactId: fr.id, number: p.number, ciclo: 1, dueDate: venc(dueDia), amount: v } });
    especiais.push({ c: fr, p, t, v });
  }
  await flush();

  let hojeSim = INICIO;
  let alertasDup = 0;
  const totalDias = SEMANAS * 7;
  for (let n = 0; n < totalDias; n++) {
    const D = somar(INICIO, n);
    hojeSim = D;
    const domingo = dowDe(D) === 0;
    // foto do início do dia: quem está em Recebimento e o que vence
    estadoInicio.set(D, new Set([...contatos.values()].filter((c) => c.estado === "Recebimento").map((c) => c.id)));
    let total = 0, capital = 0;
    for (const id of estadoInicio.get(D)) for (const p of contatos.get(id).parcelas) if (p.dueDia === D) { total += p.amount; capital += p.amount / 1.8; }
    baseOr.set(D, { total: r2(total), capital });

    // terceira quarta-feira: a meta muda no meio da semana (vale para a semana toda)
    const mudaMeta = n === 16 && SEMANAS >= 3;

    for (let h = 6; h <= 23; h++) {
      mock.timers.setTime(brt(D, h, 30).getTime());
      for (const x of pendentes.filter((q) => q.dia === D && q.hora === h)) { await completarPendente(x, brt(D, h, 10 + Math.floor(rng() * 40))); x.feito = true; }
      for (let i = pendentes.length - 1; i >= 0; i--) if (pendentes[i].feito) pendentes.splice(i, 1);
      if (mudaMeta && h === 12) {
        cfg = { rec: [60, 80, 100], lib: [70, 100, 130] };
        await prisma.config.update({ where: { id: "singleton" }, data: { metaPctRecebimentoMinima: 60, metaPctRecebimentoMedia: 80, metaPctRecebimento: 100, metaPctLiberacaoMinima: 70, metaPctLiberacaoMedia: 100, metaPctLiberacao: 130 } });
        await M.registrarMetaDoDia();
      }
      if (!domingo && h >= 9 && h <= 16) {
        if (rng() < 0.3) { const c = await novoContato(D, pick([300, 400, 500])); await liberar(c, D, brt(D, h, Math.floor(rng() * 59)), c.capital); }
        if (h === 11) for (const c of [...contatos.values()].filter((x) => x.estado === "Pago" && x.pagoEm && x.pagoEm <= brt(D, 11, 0))) if (rng() < 0.05) await liberar(c, D, brt(D, h, 1 + Math.floor(rng() * 57)), pick([300, 400, 500]), { renovacao: true });
      }
      // pagamentos
      for (const c of [...contatos.values()].filter((x) => x.estado === "Recebimento" && !x.especial)) {
        const p = c.parcelas.find((q) => !q.paid && q.valorPago === 0 && q.dueDia <= D && q.ciclo === c.ciclo && !pendentes.some((z) => z.p === q));
        if (!p) continue;
        if (rng() < (domingo ? 0.02 : 0.06)) await pagar(c, p, brt(D, h, Math.floor(rng() * 58), Math.floor(rng() * 59)));
      }
      // cobranças que desistem
      if (h === 10) for (const c of [...contatos.values()].filter((x) => x.estado === "Recebimento" && !x.especial)) {
        const atrasadas = c.parcelas.filter((q) => !q.paid && q.dueDia < D).length;
        if (atrasadas >= 3 && rng() < 0.08) await mover(c, "Cravo", brt(D, 10, 20));
      }
      if (h === 15 && !domingo) for (const c of [...contatos.values()].filter((x) => x.estado === "Recebimento" && !x.especial)) if (rng() < 0.004) await mover(c, "Venda perdida", brt(D, 15, 40));
      // pagamentos de fronteira: entram no fim da hora (o horário é explícito)
      for (const e of especiais.filter((q) => !q.feito && diaBRT(q.t) === D && horaBRT(q.t) === h)) {
        e.feito = true;
        await entrar(e.c, e.p, e.v, e.t, "IA");
        await atualizarParcela(e.p, { paid: true, paidAt: e.t, amountPago: e.v, valorPago: e.v, valorPagoEm: e.t, baixadoPor: "IA" });
      }
      await flush();
      // caixa em dobro injetado nesta hora: a conferência tem que avisar na hora, uma vez só
      const dupsHora = duplicatas.filter((x) => !x.avisada && diaBRT(x.t) === D && horaBRT(x.t) === h);
      if (dupsHora.length) {
        mock.timers.setTime(brt(D, h, 59).getTime());
        const novos = await A.checarConsistenciaMetas();
        assert.equal(novos, dupsHora.length, `${D} ${h}h: a conferência devia avisar ${dupsHora.length} caixa(s) em dobro e avisou ${novos} (semente ${SEMENTE})`);
        for (const x of dupsHora) x.avisada = true;
        alertasDup += dupsHora.length;
      }
    }

    // fim do dia
    mock.timers.setTime(brt(D, 23, 59, 30).getTime());
    await M.registrarMetaDoDia();
    pctSnap.set(D, [...cfg.rec]);
    await verificarDia(D, `dia ${D}`);
    if (dowDe(D) === 6) {
      await verificarSemana(D, dono.id);
      assert.equal(await A.checarConsistenciaMetas(), 0, `${D}: sem novas divergências entre telas (semente ${SEMENTE})`);
    }
    // segunda: as semanas fechadas mantêm as % do retrato do dia; a semana em andamento usa a config de agora
    if (dowDe(D) === 1) {
      const seg0 = somar(D, -7);
      for (let i = 0; i < 6; i++) {
        const d = somar(seg0, i);
        if (!baseOr.has(d) || !pctSnap.has(d)) continue;
        const m = await M.metasDoDia(d);
        perto(m.metaRecebimentosMinima, limiares(d, D).rec[0], `semana fechada, dia ${d}: meta mínima de recebimento do retrato`);
      }
    }
  }

  // Depois de tudo: a base de cada dia continua a mesma, apesar de quem quitou, foi pra Cravo ou renovou depois.
  for (let n = 0; n < totalDias; n++) {
    const D = somar(INICIO, n);
    const g = (await M.esperadoPorDia(D, D)).get(D) || { total: 0, capital: 0 };
    perto(g.total, baseOr.get(D).total, `base de ${D} continua estável no fim da simulação`);
  }
  // E o dinheiro que entrou em domingo/sábado à noite não sumiu: soma das semanas de comissão + domingos = caixa total (menos o que
  // passou da última segunda simulada).
  const ate = somar(INICIO, totalDias - 1);
  const noPeriodo = caixa.filter((x) => diaBRT(x.t) <= ate);
  const contado = noPeriodo.filter((x) => diaComissaoOr(x.t) <= ate);
  const depois = noPeriodo.filter((x) => diaComissaoOr(x.t) > ate);
  perto(r2(contado.reduce((s, x) => s + x.v, 0) + depois.reduce((s, x) => s + x.v, 0)), r2(noPeriodo.reduce((s, x) => s + x.v, 0)), "conservação do oráculo");
  // A conservação do SISTEMA: o que as semanas de comissão atribuíram (somando todas) = tudo que entrou (domingo inclusive), menos o
  // fim de semana da última semana (que é da segunda seguinte, fora da simulação).
  perto(r2(sistemaComissaoRec), r2(contado.reduce((s, x) => s + x.v, 0)), "conservação: nenhum real some nem conta duas vezes entre as semanas de comissão");
  // Mudança de etapa SEM registro (o defeito que o bulk e a renovação tinham): a conferência avisa.
  // Com o aviso ligado (e sem número de WhatsApp no banco de teste, então nada é enviado) o caminho do alerta roda inteiro sem erro.
  await prisma.config.update({ where: { id: "singleton" }, data: { alertaCriticos: true, alertaWhatsapp: "5511999999999" } });
  const alvoSemLog = [...contatos.values()].find((c) => c.estado === "Pago") || [...contatos.values()].find((c) => c.estado === "Recebimento");
  mock.timers.setTime(brt(somar(INICIO, totalDias - 1), 23, 30).getTime());
  await prisma.contact.update({ where: { id: alvoSemLog.id }, data: { stageId: etapas["Cravo"], entrouEtapaEm: new Date() } });
  assert.equal(await A.checarConsistenciaMetas(), 1, "etapa mudada sem registro no histórico precisa gerar 1 aviso");
  assert.ok(duplicatas.length > 0, "a simulação precisa ter injetado caixa em dobro para o teste valer");
  assert.equal(alertasDup, duplicatas.length);
});
