// Testes das regras do aviso de metas na tela (lib/metasAviso.js): próxima meta, textos, barras, o que avisar e uma vez só.
// Os números do resumo são os REAIS de sábado, 07/11/2026 (recebido R$ 4.174,45; liberado R$ 1.300,00; ambos entre a mínima e a média).
import test from "node:test";
import assert from "node:assert/strict";
import {
  proximaMeta, vendasPara, metricasDe, legendaDaBarra, avisosDoMomento, juntarAlertas, geometriaDaBarra, money,
} from "../lib/metasAviso.js";

const SABADO = {
  dia: "2026-11-07",
  recebimentosHoje: 4174.45, metaRecebimentosMinima: 3924.25, metaRecebimentosMedia: 4328.22, metaRecebimentosDia: 4905.32,
  liberadoHoje: 1300, metaLiberacaoMinima: 1264.66, metaLiberacaoMedia: 1580.82, metaLiberacaoDia: 1896.99,
  niveis: { recebimentos: "minima", liberacao: "minima" },
};
const DOMINGO = {
  dia: "2026-11-08",
  recebimentosHoje: 59.4, metaRecebimentosMinima: 0, metaRecebimentosMedia: 0, metaRecebimentosDia: 0,
  liberadoHoje: 0, metaLiberacaoMinima: 0, metaLiberacaoMedia: 0, metaLiberacaoDia: 0,
  niveis: { recebimentos: null, liberacao: null },
};
const n = (s) => String(s).replaceAll(" ", " "); // "R$ " não quebra linha; aqui comparamos com espaço comum
const por = (ms, id) => ms.find((m) => m.id === id);
const tipos = (alertas) => alertas.map((a) => `${a.tipo}:${a.metrica}`).sort();

test("próxima meta: mínima → média → cheia, ignora faixa zerada, null quando bateu tudo", () => {
  const metas = { minima: 100, media: 200, meta: 300 };
  assert.deepEqual([proximaMeta(0, metas).chave, proximaMeta(0, metas).faltam], ["minima", 100]);
  assert.deepEqual([proximaMeta(100, metas).chave, proximaMeta(100, metas).faltam], ["media", 100], "bateu a mínima (>=): a próxima é a média");
  assert.deepEqual([proximaMeta(250, metas).chave, proximaMeta(250, metas).faltam], ["meta", 50]);
  assert.equal(proximaMeta(300, metas), null);
  assert.equal(proximaMeta(50, { minima: 0, media: 200, meta: 300 }).chave, "media", "faixa zerada não é meta");
  assert.equal(proximaMeta(0.1 + 0.2, { minima: 1, media: 2, meta: 3 }).faltam, 0.7, "sem sobra de ponto flutuante");
});

test("vendas que faltam: arredonda para cima, sem virar 2 por causa de ponto flutuante", () => {
  assert.equal(n(vendasPara(280.82)), "≈ 1 venda de R$ 300,00");
  assert.equal(n(vendasPara(300)), "≈ 1 venda de R$ 300,00");
  assert.equal(n(vendasPara(300.00000000000006)), "≈ 1 venda de R$ 300,00");
  assert.equal(n(vendasPara(300.01)), "≈ 2 vendas de R$ 300,00");
  assert.equal(n(vendasPara(470.84)), "≈ 2 vendas de R$ 300,00");
  assert.equal(n(money(1124.84)), "R$ 1.124,84");
});

test("métricas do dia: sábado real (nível, próxima, barra), domingo sem meta some, só uma métrica com meta", () => {
  const ms = metricasDe(SABADO);
  assert.equal(ms.length, 2);
  const rec = por(ms, "receb");
  const lib = por(ms, "lib");
  assert.equal(rec.nivel, "minima");
  assert.deepEqual([rec.prox.chave, rec.prox.faltam], ["media", 153.77]);
  assert.deepEqual([rec.pct, rec.marcos], [85.1, [80, 88.2]]);
  assert.equal(lib.nivel, "minima");
  assert.deepEqual([lib.prox.chave, lib.prox.faltam], ["media", 280.82]);
  assert.deepEqual([lib.pct, lib.marcos], [68.5, [66.7, 83.3]]);

  assert.deepEqual(metricasDe(DOMINGO), [], "domingo sem parcela a vencer: nada a perseguir, o aviso não aparece");
  const soLib = metricasDe({ ...DOMINGO, metaLiberacaoMinima: 100, metaLiberacaoMedia: 200, metaLiberacaoDia: 300, liberadoHoje: 0, niveis: { liberacao: "abaixo" } });
  assert.deepEqual(soLib.map((m) => m.id), ["lib"]);
  // Sem nível vindo da API, calcula aqui com a mesma regra.
  assert.equal(por(metricasDe({ ...SABADO, niveis: {} }), "receb").nivel, "minima");
  // Passou da meta cheia: a barra vai até o que foi feito e os traços ficam proporcionais.
  const passou = geometriaDaBarra(400, { minima: 100, media: 200, meta: 300 });
  assert.deepEqual([passou.pct, passou.marcos], [100, [25, 50]]);
});

test("legenda da barra usa os rótulos da tela de Metas e diz quantas vendas faltam na liberação", () => {
  const ms = metricasDe(SABADO);
  assert.equal(n(legendaDaBarra(por(ms, "receb"))), "Bateu a mínima · próxima: média, R$ 4.328,22");
  assert.equal(n(legendaDaBarra(por(ms, "lib"))), "Bateu a mínima · próxima: média, R$ 1.580,82 · ≈ 1 venda de R$ 300,00");
  const abaixo = metricasDe({ ...SABADO, recebimentosHoje: 100, niveis: { recebimentos: "abaixo", liberacao: "minima" } });
  assert.equal(n(legendaDaBarra(por(abaixo, "receb"))), "Abaixo da mínima · próxima: mínima, R$ 3.924,25");
  const tudo = metricasDe({ ...SABADO, recebimentosHoje: 5000, niveis: { recebimentos: "meta", liberacao: "minima" } });
  assert.equal(n(legendaDaBarra(por(tudo, "receb"))), "Meta cheia batida!");
  assert.equal(por(tudo, "receb").prox, null);
});

test("\"falta pouco\": sábado real avisa cada métrica uma vez, e nunca de novo no mesmo dia", () => {
  const ms = metricasDe(SABADO);
  const um = avisosDoMomento({ ms, dia: SABADO.dia, feitos: null, niveisVistos: null, agora: 1 });
  assert.deepEqual(tipos(um.alertas), ["falta:lib", "falta:receb"], "primeira leitura do dia não comemora nada, só avisa o que está perto");
  const rec = um.alertas.find((a) => a.metrica === "receb");
  assert.deepEqual([rec.quase, rec.alvoChave, rec.faltam, rec.pctFalta], ["na média", "media", 153.77, "3,6"]);
  assert.equal(rec.vendas, null, "recebimento não fala em vendas");
  const lib = um.alertas.find((a) => a.metrica === "lib");
  assert.deepEqual([lib.pctFalta, n(lib.vendas)], ["17,8", "≈ 1 venda de R$ 300,00"]);
  assert.deepEqual(um.feitos.chaves.filter((k) => k.startsWith("receb")).sort(), ["receb:media:10", "receb:media:30", "receb:media:5", "receb:media:50"]);
  assert.deepEqual(um.feitos.chaves.filter((k) => k.startsWith("lib")).sort(), ["lib:media:30", "lib:media:50"]);
  assert.deepEqual(um.niveisVistos, { dia: SABADO.dia, niveis: { receb: "minima", lib: "minima" } });

  const dois = avisosDoMomento({ ms, dia: SABADO.dia, feitos: um.feitos, niveisVistos: um.niveisVistos, agora: 2 });
  assert.deepEqual(dois.alertas, [], "mesma situação 1 min depois: nada novo");
  // Cruzar uma faixa nova avisa de novo: a liberação vai de 17,8% para 8% faltando (cruza a de 10%).
  const mais = metricasDe({ ...SABADO, liberadoHoje: 1455 });
  const tres = avisosDoMomento({ ms: mais, dia: SABADO.dia, feitos: dois.feitos, niveisVistos: dois.niveisVistos, agora: 3 });
  assert.deepEqual(tipos(tres.alertas), ["falta:lib"]);
  // Outro dia: tudo recomeça.
  const amanha = avisosDoMomento({ ms, dia: "2026-11-09", feitos: tres.feitos, niveisVistos: tres.niveisVistos, agora: 4 });
  assert.deepEqual(tipos(amanha.alertas), ["falta:lib", "falta:receb"]);
});

test("aba escondida não gasta o aviso: ele sai quando a aba volta", () => {
  const ms = metricasDe(SABADO);
  const escondida = avisosDoMomento({ ms, dia: SABADO.dia, feitos: null, niveisVistos: null, visivel: false });
  assert.deepEqual(escondida.alertas, []);
  assert.deepEqual(escondida.feitos.chaves, [], "nenhuma faixa foi marcada como avisada");
  const voltou = avisosDoMomento({ ms, dia: SABADO.dia, feitos: escondida.feitos, niveisVistos: escondida.niveisVistos, visivel: true });
  assert.deepEqual(tipos(voltou.alertas), ["falta:lib", "falta:receb"]);
});

test("bateu um nível: aviso verde uma vez, só depois do ponto de partida do dia, sem repetir o \"falta pouco\" da próxima", () => {
  const ms = metricasDe(SABADO); // receb e lib estão na mínima
  const partida = { dia: SABADO.dia, niveis: { receb: "abaixo", lib: "minima" } };
  const r = avisosDoMomento({ ms, dia: SABADO.dia, feitos: null, niveisVistos: partida, agora: 10 });
  assert.deepEqual(tipos(r.alertas), ["bateu:receb", "falta:lib"], "recebimentos subiu de nível; liberação não mudou e segue com o falta pouco");
  const bateu = r.alertas.find((a) => a.tipo === "bateu");
  assert.deepEqual([bateu.titulo, bateu.nivel, bateu.nomeNivel], ["Recebimentos", "minima", "a mínima"]);
  assert.equal(n(bateu.detalhe), "R$ 4.174,45 · próxima: média, faltam R$ 153,77");
  assert.ok(r.feitos.chaves.includes("receb:media:5"), "as faixas da nova meta já cruzadas ficam marcadas (não avisam 1 min depois)");
  assert.equal(r.niveisVistos.niveis.receb, "minima");
  const depois = avisosDoMomento({ ms, dia: SABADO.dia, feitos: r.feitos, niveisVistos: r.niveisVistos, agora: 11 });
  assert.deepEqual(depois.alertas, [], "no minuto seguinte não comemora nem avisa de novo");

  // Liberação: a venda de R$ 300 fecha a média.
  const media = metricasDe({ ...SABADO, liberadoHoje: 1600, niveis: { recebimentos: "minima", liberacao: "media" } });
  const l = avisosDoMomento({ ms: media, dia: SABADO.dia, feitos: depois.feitos, niveisVistos: depois.niveisVistos, agora: 12 });
  const bl = l.alertas.find((a) => a.metrica === "lib");
  assert.deepEqual([bl.tipo, bl.nomeNivel, n(bl.detalhe)], ["bateu", "a média", "R$ 1.600,00 · próxima: meta cheia, faltam R$ 296,99 (≈ 1 venda de R$ 300,00)"]);

  // Meta cheia: nada mais a perseguir.
  const cheia = metricasDe({ ...SABADO, recebimentosHoje: 5000, niveis: { recebimentos: "meta", liberacao: "minima" } });
  const c = avisosDoMomento({ ms: cheia, dia: SABADO.dia, feitos: null, niveisVistos: { dia: SABADO.dia, niveis: { receb: "media", lib: "minima" } }, agora: 13 });
  const bc = c.alertas.find((a) => a.tipo === "bateu");
  assert.deepEqual([bc.nomeNivel, n(bc.detalhe)], ["a meta cheia", "R$ 5.000,00 · todas as metas de recebimentos batidas"]);
});

test("comemoração: a aba escondida adia, nível que cai (baixa estornada) não comemora, mesmo nível não repete", () => {
  const ms = metricasDe(SABADO);
  const partida = { dia: SABADO.dia, niveis: { receb: "abaixo", lib: "minima" } };
  const escondida = avisosDoMomento({ ms, dia: SABADO.dia, feitos: null, niveisVistos: partida, visivel: false });
  assert.deepEqual(escondida.alertas, []);
  assert.equal(escondida.niveisVistos.niveis.receb, "abaixo", "o nível antigo fica guardado para comemorar quando a aba voltar");
  const voltou = avisosDoMomento({ ms, dia: SABADO.dia, feitos: escondida.feitos, niveisVistos: escondida.niveisVistos, visivel: true });
  assert.ok(voltou.alertas.some((a) => a.tipo === "bateu" && a.metrica === "receb"));

  const caiu = avisosDoMomento({ ms, dia: SABADO.dia, feitos: voltou.feitos, niveisVistos: { dia: SABADO.dia, niveis: { receb: "media", lib: "minima" } } });
  assert.deepEqual(caiu.alertas.filter((a) => a.tipo === "bateu"), []);
  assert.equal(caiu.niveisVistos.niveis.receb, "minima", "o novo nível vira o ponto de partida");

  const outroDia = avisosDoMomento({ ms, dia: "2026-11-09", feitos: null, niveisVistos: { dia: SABADO.dia, niveis: { receb: "abaixo", lib: "abaixo" } } });
  assert.deepEqual(outroDia.alertas.filter((a) => a.tipo === "bateu"), [], "ponto de partida de outro dia não vale");
});

test("avisos na tela: o mais novo da mesma métrica substitui o anterior; 'bateu' tira o 'falta pouco' dela", () => {
  const f = (metrica, id) => ({ id, tipo: "falta", metrica });
  const b = (metrica, id) => ({ id, tipo: "bateu", metrica });
  const a = juntarAlertas([f("receb", "r1"), f("lib", "l1")], [f("receb", "r2")]);
  assert.deepEqual(a.map((x) => x.id), ["l1", "r2"]);
  const c = juntarAlertas(a, [b("receb", "b1")]);
  assert.deepEqual(c.map((x) => x.id), ["l1", "b1"], "o falta pouco de recebimentos não vale mais");
  const d = juntarAlertas(c, [f("receb", "r3")]);
  assert.deepEqual(d.map((x) => x.id), ["l1", "b1", "r3"], "falta pouco novo convive com a comemoração antiga");
  assert.deepEqual(juntarAlertas([], []), []);
});
