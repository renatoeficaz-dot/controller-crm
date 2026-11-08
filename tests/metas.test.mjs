// Testes das metas num banco SQLite isolado (nada toca produção). Rodar: npm test
// Cobrem as regras que já causaram número errado: recebido por dia (caixa, sem duplicata, pagamento em dois dias), base da meta pela etapa
// no INÍCIO do dia, meta de liberação do sábado, semana de comissão e a comissão por metas ponta a ponta.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

process.env.TZ = "America/Sao_Paulo"; // o sistema roda no horário de Brasília

const pasta = mkdtempSync(join(tmpdir(), "controller-metas-"));
writeFileSync(join(pasta, "teste.db"), ""); // o engine SQLite do Prisma no Windows exige o arquivo antes do db push
const url = `file:${join(pasta, "teste.db").replaceAll("\\", "/")}`;
process.env.DATABASE_URL = url;
const preparar = spawnSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "db", "push", "--skip-generate"], {
  env: { ...process.env, DATABASE_URL: url },
  encoding: "utf8",
});
assert.equal(preparar.status, 0, preparar.stderr);

const { prisma } = await import("../lib/prisma.js");
const M = await import("../lib/metas.js");
const { calcularComissaoMetas } = await import("../lib/comissaoMetas.js");

const brt = (dia, h, m = 0) => new Date(`${dia}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00-03:00`);
const venc = (dia) => new Date(dia + "T00:00:00.000Z");
const etapas = {};
let seq = 0;

async function criarEtapa(nome) {
  etapas[nome] = (await prisma.stage.create({ data: { name: nome, order: ++seq } })).id;
}
async function contato(nome, etapaAtual, extras = {}) {
  return prisma.contact.create({ data: { name: nome, stageId: etapas[etapaAtual], valorCapital: 300, ...extras } });
}
const log = (contactId, de, para, quando) => prisma.etapaLog.create({ data: { contactId, deEtapa: de, paraEtapa: para, createdAt: quando } });
const parcela = (contactId, dados) => prisma.parcela.create({ data: { contactId, number: 1, amount: 100, ...dados, dueDate: venc(dados.dueDia), dueDia: undefined } });
const entrada = (contactId, parcelaId, amount, quando) =>
  prisma.lancamento.create({ data: { type: "entrada", amount, description: "Baixa — teste", contactId, parcelaId, createdAt: quando } });
const liberacao = (contactId, amount, quando) =>
  prisma.lancamento.create({ data: { type: "saida", amount, description: "Liberação de capital — teste", contactId, createdAt: quando } });

before(async () => {
  await prisma.config.create({
    data: {
      id: "singleton", honorariosPct: 80,
      metaPctRecebimentoMinima: 50, metaPctRecebimentoMedia: 70, metaPctRecebimento: 100,
      metaPctLiberacaoMinima: 80, metaPctLiberacaoMedia: 100, metaPctLiberacao: 120,
    },
  });
  for (const n of ["Liberação pagamento", "Recebimento", "Pago", "Cravo", "Venda perdida"]) await criarEtapa(n);
});
after(async () => {
  await prisma.$disconnect();
});

test("recebido do dia = o que entrou no caixa naquele dia (pagamento em 2 dias, duplicata cortada, baixa sem lançamento, juros)", async () => {
  const D1 = "2026-03-03";
  const D2 = "2026-03-04";
  // A: parcela de 100 paga em duas vezes (40 em D1, 60 em D2) — já vencida em D1 (conta como recuperação).
  const a = await contato("A", "Recebimento");
  const pa = await parcela(a.id, { dueDia: "2026-03-02", amount: 100, paid: true, paidAt: brt(D2, 10), amountPago: 100, valorPago: 100, valorPagoEm: brt(D2, 10) });
  await entrada(a.id, pa.id, 40, brt(D1, 10));
  await entrada(a.id, pa.id, 60, brt(D2, 10));
  // B: parcela de 50 com o lançamento lançado EM DOBRO (50 + 50) — o excesso não pode virar recebido.
  const b = await contato("B", "Recebimento");
  const pb = await parcela(b.id, { dueDia: D1, amount: 50, paid: true, paidAt: brt(D1, 11), amountPago: 50, baixadoPor: "Ana" });
  await entrada(b.id, pb.id, 50, brt(D1, 11));
  await entrada(b.id, pb.id, 50, brt(D1, 11, 1));
  // C: baixa antiga, sem nenhum lançamento — entra pelo valor da parcela, no dia da baixa.
  const c = await contato("C", "Recebimento");
  await parcela(c.id, { dueDia: D1, amount: 30, paid: true, paidAt: brt(D1, 12), amountPago: 30, baixadoPor: "Bia" });
  // D: 200 + 20 de juros: tudo que entrou conta.
  const d = await contato("D", "Recebimento");
  const pd = await parcela(d.id, { dueDia: D1, amount: 200, paid: true, paidAt: brt(D1, 13), amountPago: 220, baixadoPor: "Ana" });
  await entrada(d.id, pd.id, 200, brt(D1, 13));
  await entrada(d.id, pd.id, 20, brt(D1, 13, 1));

  const r1 = await M.resultadoDoDia(D1);
  const r2 = await M.resultadoDoDia(D2);
  assert.equal(r1.recebimentos, 340, "D1 = 40 (1ª parte de A) + 50 (B sem a duplicata) + 30 (C) + 220 (D com juros)");
  assert.equal(r2.recebimentos, 60, "D2 = 2ª parte de A");
  assert.equal(r1.valorRecebido, r1.recebimentos);
  assert.equal(r1.baixas, 4);
  assert.equal(r1.clientesRecebimento, 4);
  assert.equal(r1.valorRecuperado, 40, "só a parte de A (parcela vencida em 02/03); as outras venceram em D1");
  assert.equal(r2.valorRecuperado, 60);
  assert.equal((await M.resultadoDoDia(D1, "Ana")).recebimentos, 270, "recorte por quem deu a baixa");
  assert.equal((await M.resultadoDoDia(D1, ["Ana", "Bia"])).recebimentos, 300, "recorte por equipe");

  // Mesma conta no calendário (série), seja a janela de 1 dia, de 2 dias ou de uma semana — o bug antigo jogava o caixa da janela no último dia.
  for (const [ini, fim] of [[D1, D1], [D1, D2], ["2026-03-01", "2026-03-08"]]) {
    const serie = await M.serieDeDias(ini, fim);
    assert.equal(serie.find((x) => x.dia === D1)?.recebimentos, 340, `série ${ini}..${fim} em D1`);
    const dia2 = serie.find((x) => x.dia === D2);
    if (dia2) assert.equal(dia2.recebimentos, 60, `série ${ini}..${fim} em D2`);
  }

  // Itens (lista do modal) somam o total, uma linha por parcela/dia.
  const { itens } = await M.recebidosNoPeriodo(D1, D1);
  assert.equal(itens.length, 4);
  assert.equal(Math.round(itens.reduce((s, x) => s + x.valor, 0) * 100) / 100, 340);
});

test("base da meta = parcelas do dia de quem ESTAVA em Recebimento no início do dia (histórico), não a etapa de agora", async () => {
  const D = "2026-03-05";
  const antes = brt("2026-02-20", 10);
  // X quitou e foi pra "Pago" durante o dia: continua na base do dia.
  const x = await contato("X", "Pago");
  await log(x.id, null, "Recebimento", antes);
  await log(x.id, "Recebimento", "Pago", brt(D, 15));
  await parcela(x.id, { dueDia: D, amount: 100, paid: true, paidAt: brt(D, 15), amountPago: 100 });
  // Y foi pra Cravo na véspera: fora.
  const y = await contato("Y", "Cravo");
  await log(y.id, null, "Recebimento", antes);
  await log(y.id, "Recebimento", "Cravo", brt("2026-03-04", 10));
  await parcela(y.id, { dueDia: D, amount: 50 });
  // Z entrou em Recebimento no próprio dia (a 1ª parcela só vence amanhã): fora.
  const z = await contato("Z", "Recebimento");
  await log(z.id, null, "Liberação pagamento", antes);
  await log(z.id, "Liberação pagamento", "Recebimento", brt(D, 9));
  await parcela(z.id, { dueDia: D, amount: 70 });
  // W foi marcado "Venda perdida" durante o dia: estava em Recebimento no início, então conta.
  const w = await contato("W", "Venda perdida");
  await log(w.id, null, "Recebimento", antes);
  await log(w.id, "Recebimento", "Venda perdida", brt(D, 16));
  await parcela(w.id, { dueDia: D, amount: 30 });
  // V é cadastro antigo, sem nenhum log: vale a etapa atual.
  const v = await contato("V", "Recebimento");
  await parcela(v.id, { dueDia: D, amount: 20 });

  const mapa = await M.esperadoPorDia(D, D);
  const g = mapa.get(D);
  assert.equal(g.total, 150, "100 (X) + 30 (W) + 20 (V)");
  assert.equal(Math.round(g.capital * 100) / 100, Math.round((150 / 1.8) * 100) / 100, "capital = valor ÷ (1 + honorários 80%)");

  // E a meta do dia sai dessa base: 50% / 70% / 100% de 150.
  const metas = await M.metasDoDia(D);
  assert.equal(metas.valorEsperadoDia, 150);
  assert.equal(metas.metaRecebimentosMinima, 75);
  assert.equal(metas.metaRecebimentosMedia, 105);
  assert.equal(metas.metaRecebimentosDia, 150);
});

test("meta de liberação: sábado vale a metade; domingo e dia útil comuns", () => {
  const cfg = { metaPctLiberacaoMinima: 80, metaPctLiberacaoMedia: 100, metaPctLiberacao: 120 };
  const util = M.metaLiberacaoDe(1000, cfg, "2026-03-06"); // sexta
  const sab = M.metaLiberacaoDe(1000, cfg, "2026-03-07"); // sábado
  assert.deepEqual([util.minima, util.media, util.dia], [800, 1000, 1200]);
  assert.deepEqual([sab.minima, sab.media, sab.dia], [400, 500, 600]);
  assert.deepEqual(Object.values(M.metaLiberacaoDe(1000, cfg)).slice(3), [800, 1000, 1200], "sem dia informado não aplica o fator");
});

test("semana de comissão: segunda a sábado; no domingo vale a semana que acabou de fechar", () => {
  assert.equal(M.inicioSemanaVigente("2026-03-04"), "2026-03-02"); // quarta
  assert.equal(M.inicioSemanaVigente("2026-03-02"), "2026-03-02"); // segunda
  assert.equal(M.inicioSemanaVigente("2026-03-07"), "2026-03-02"); // sábado
  assert.equal(M.inicioSemanaVigente("2026-03-08"), "2026-03-02"); // domingo
  assert.equal(M.inicioSemanaVigente("2026-03-09"), "2026-03-09"); // segunda seguinte
});

test("comissão por metas: faixa de recebimento + faixa de liberação sobre o recebido do dia, igual ao que o Metas mostra", async () => {
  const D = "2026-03-06"; // sexta
  const dono = await prisma.user.create({ data: { name: "Comissionado", login: "comissionado", passwordHash: "x", role: "admin" } });
  await prisma.comissaoMetasConfig.create({ data: { userId: dono.id, desde: new Date("2026-03-02T00:00:00.000Z"), pctMinima: 1, pctMedia: 2, pctMaxima: 3 } });
  // 10 clientes em Recebimento com 100 a vencer em D → base 1.000 (capital 555,56).
  const clientes = [];
  for (let i = 1; i <= 10; i++) {
    const c = await contato("Com" + i, "Recebimento");
    await log(c.id, null, "Recebimento", brt("2026-02-20", 10));
    clientes.push({ c, p: await parcela(c.id, { dueDia: D, amount: 100 }) });
  }
  // 8 pagam (R$ 800 → entre a média de 700 e a meta de 1.000: faixa média, 2%).
  for (const { c, p } of clientes.slice(0, 8)) {
    await prisma.parcela.update({ where: { id: p.id }, data: { paid: true, paidAt: brt(D, 10), amountPago: 100, valorPago: 100, baixadoPor: "IA" } });
    await entrada(c.id, p.id, 100, brt(D, 10));
  }
  // Liberou R$ 700 (meta de liberação 120% de 555,56 = 666,67 → meta cheia, 3%).
  for (let i = 0; i < 7; i++) await liberacao(clientes[i].c.id, 100, brt(D, 11));

  const r = await calcularComissaoMetas(dono.id, brt(D, 15));
  const dia = r.detalhe.find((x) => x.dia === D);
  assert.equal(dia.recebido, 800);
  assert.equal(dia.faixaRec, "media");
  assert.equal(dia.liberado, 700);
  assert.equal(dia.faixaLib, "maxima");
  assert.equal(dia.pctTotal, 5);
  assert.equal(dia.comissao, 40, "800 × (2% + 3%)");
  // O mesmo dia, olhado pelo Metas, tem o mesmo recebido e as mesmas metas.
  const real = await M.resultadoDoDia(D);
  const metas = await M.metasDoDia(D);
  assert.equal(real.recebimentos, dia.recebido);
  assert.equal(metas.metaRecebimentosMedia, dia.metaRec.media);
  assert.equal(metas.metaLiberacaoDia, dia.metaLib.maxima);
  // Fora de D (e do sábado de B/A) o resto da semana não rende nada: o total da semana é o desse dia + o que outros testes deixaram.
  assert.ok(r.totalSemana >= 40);
  assert.equal(r.maxPct, 6);
});

test("fechamento do sábado às 17h: o que entra depois conta na segunda da semana seguinte (recebido e liberado)", async () => {
  const [SAB, SEG] = ["2026-03-14", "2026-03-16"];
  const dono = await prisma.user.findFirst({ where: { login: "comissionado" } });
  const s1 = await contato("S1", "Recebimento");
  const p1 = await parcela(s1.id, { dueDia: SAB, amount: 100, paid: true, paidAt: brt(SAB, 16, 30), amountPago: 100 });
  await entrada(s1.id, p1.id, 100, brt(SAB, 16, 30)); // antes do fechamento: fica no sábado
  const s2 = await contato("S2", "Recebimento");
  const p2 = await parcela(s2.id, { dueDia: SAB, amount: 60, paid: true, paidAt: brt(SAB, 17, 30), amountPago: 60 });
  await entrada(s2.id, p2.id, 60, brt(SAB, 17, 30)); // depois do fechamento: vai pra segunda
  await liberacao(s1.id, 50, brt(SAB, 15)); // liberação antes: sábado
  await liberacao(s1.id, 200, brt(SAB, 18)); // liberação depois: segunda
  const m1 = await contato("M1", "Recebimento");
  const pm = await parcela(m1.id, { dueDia: SEG, amount: 40, paid: true, paidAt: brt(SEG, 9), amountPago: 40 });
  await entrada(m1.id, pm.id, 40, brt(SEG, 9));

  const semana1 = await calcularComissaoMetas(dono.id, brt("2026-03-12", 12));
  const sab = semana1.detalhe.find((x) => x.dia === SAB);
  assert.equal(sab.recebido, 100, "sábado conta só até as 17h");
  assert.equal(sab.liberado, 50);
  assert.equal(sab.ajusteRec, -60, "R$ 60 saíram do sábado (entraram depois das 17h)");
  assert.equal(sab.ajusteLib, -200);

  const semana2 = await calcularComissaoMetas(dono.id, brt("2026-03-18", 12));
  const seg = semana2.detalhe.find((x) => x.dia === SEG);
  assert.equal(seg.recebido, 100, "segunda = os 40 dela + os 60 de sábado depois das 17h");
  assert.equal(seg.liberado, 200, "a liberação de sábado depois das 17h vem pra segunda");
  assert.equal(seg.ajusteRec, 60);
  assert.equal(seg.ajusteLib, 200);

  // O Metas (dia do calendário) continua mostrando o dia inteiro.
  assert.equal((await M.resultadoDoDia(SAB)).recebimentos, 160);
  assert.equal((await M.resultadoDoDia(SAB)).liberado, 250);
});
