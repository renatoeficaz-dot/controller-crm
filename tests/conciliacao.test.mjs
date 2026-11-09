// Conciliação por OFX (lib/conciliacaoOfx.js): leitura do arquivo (SGML e XML), datas/valores, casamento extrato x lançamentos e fechamento do caixa.
import test from "node:test";
import assert from "node:assert/strict";
import { lerOfx, dataOfx, valorOfx, conciliar, fecharCaixa, decodificarOfx } from "../lib/conciliacaoOfx.js";

const SGML = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
CHARSET:1252

<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><ACCTID>12345-6</ACCTID></BANKACCTFROM>
<BANKTRANLIST><DTSTART>20261107000000[-3:BRT]<DTEND>20261108235959[-3:BRT]
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261107143000[-3:BRT]<TRNAMT>150.00<FITID>A1<NAME>Pix recebido<MEMO>JOAO DA SILVA</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261107230500[-3:BRT]<TRNAMT>-1.234,50<FITID>B2<MEMO>Pix enviado MARIA</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261108<TRNAMT>80,5<FITID>C3<MEMO>Pix</STMTTRN>
</BANKTRANLIST><LEDGERBAL><BALAMT>1000.25<DTASOF>20261108235959[-3:BRT]</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

test("OFX SGML: movimentos, sinal, vírgula decimal, data sem hora e saldo final", () => {
  const o = lerOfx(SGML);
  assert.equal(o.acctId, "12345-6");
  assert.equal(o.movimentos.length, 3);
  assert.deepEqual(o.movimentos.map((m) => [m.tipo, m.valor]), [["entrada", 150], ["saida", 1234.5], ["entrada", 80.5]]);
  assert.equal(o.movimentos[0].descricao, "Pix recebido — JOAO DA SILVA");
  assert.equal(o.saldo, 1000.25);
  assert.equal(o.movimentos[0].data.toISOString(), "2026-11-07T17:30:00.000Z"); // 14:30 em Brasília
  assert.equal(o.movimentos[2].data.toISOString(), "2026-11-08T15:00:00.000Z"); // sem hora = meio-dia de Brasília
});

test("OFX XML (v2) também é lido; arquivo que não é OFX é recusado", () => {
  const xml = `<?xml version="1.0"?><OFX><BANKTRANLIST><STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20261105100000</DTPOSTED><TRNAMT>20.00</TRNAMT><FITID>X</FITID><MEMO>Teste</MEMO></STMTTRN></BANKTRANLIST></OFX>`;
  const o = lerOfx(xml);
  assert.equal(o.movimentos.length, 1);
  assert.equal(o.movimentos[0].valor, 20);
  assert.throws(() => lerOfx("data,valor\n1,2"), /OFX/);
});

test("sem FITID, dois pagamentos idênticos continuam sendo dois movimentos distintos", () => {
  const mov = "<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261105100000<TRNAMT>10.00<MEMO>Pix</STMTTRN>";
  const o = lerOfx(`<OFX><BANKTRANLIST>${mov}${mov}</BANKTRANLIST></OFX>`);
  assert.equal(o.movimentos.length, 2);
  assert.notEqual(o.movimentos[0].chave, o.movimentos[1].chave);
});

test("datas, valores e acentos do Windows-1252", () => {
  assert.equal(dataOfx("20261108235959[-3:BRT]").toISOString(), "2026-11-09T02:59:59.000Z");
  assert.equal(dataOfx("20261108120000[0:GMT]").toISOString(), "2026-11-08T12:00:00.000Z");
  assert.equal(dataOfx("lixo"), null);
  assert.equal(valorOfx("-1.234,56"), -1234.56);
  assert.equal(valorOfx("1,234.56"), 1234.56);
  assert.ok(Number.isNaN(valorOfx("")));
  assert.equal(decodificarOfx(Uint8Array.from([0x4a, 0x6f, 0xe3, 0x6f])), "João"); // "João" em Windows-1252
});

test("conciliar: casa por tipo+valor+dia, escolhe o nome parecido e deixa as sobras dos dois lados", () => {
  const movs = [
    { id: "m1", data: "2026-11-07T17:30:00Z", valor: 100, tipo: "entrada", descricao: "Pix recebido — JOAO DA SILVA" },
    { id: "m2", data: "2026-11-07T18:00:00Z", valor: 100, tipo: "entrada", descricao: "Pix recebido — PEDRO LIMA" },
    { id: "m3", data: "2026-11-07T19:00:00Z", valor: 55.5, tipo: "entrada", descricao: "Pix desconhecido" },
    { id: "m4", data: "2026-11-07T20:00:00Z", valor: 300, tipo: "saida", descricao: "Pix enviado" },
  ];
  const lancs = [
    { id: "l1", data: "2026-11-07T18:05:00Z", amount: 100, type: "entrada", description: "Parcela 3ª — Pedro Lima" },
    { id: "l2", data: "2026-11-07T17:00:00Z", amount: 100, type: "entrada", description: "Parcela 1ª — João da Silva" },
    { id: "l3", data: "2026-11-07T16:00:00Z", amount: 70, type: "entrada", description: "Parcela 2ª — Ana" }, // sem Pix no extrato
    { id: "l4", data: "2026-11-09T16:00:00Z", amount: 300, type: "saida", description: "Liberação" }, // 2 dias depois: fora da tolerância
  ];
  const r = conciliar(movs, lancs);
  const par = Object.fromEntries(r.pares.map((p) => [p.movId, p.lancId]));
  assert.deepEqual(par, { m1: "l2", m2: "l1" });
  assert.deepEqual(r.movsSemLanc.sort(), ["m3", "m4"]);
  assert.deepEqual(r.lancsSemMov.sort(), ["l3", "l4"]);
});

test("conciliar: um lançamento só serve a um movimento; entrada não casa com saída; 1 dia de tolerância", () => {
  const r = conciliar(
    [{ id: "m1", data: "2026-11-07T10:00:00Z", valor: 50, tipo: "entrada", descricao: "" }, { id: "m2", data: "2026-11-07T11:00:00Z", valor: 50, tipo: "entrada", descricao: "" }],
    [{ id: "l1", data: "2026-11-08T10:00:00Z", amount: 50, type: "entrada", description: "" }, { id: "l2", data: "2026-11-07T10:00:00Z", amount: 50, type: "saida", description: "" }],
  );
  assert.equal(r.pares.length, 1);
  assert.equal(r.movsSemLanc.length, 1);
  assert.deepEqual(r.lancsSemMov, ["l2"]);
});

test("fechar caixa: totais do extrato x sistema, diferença do período e do saldo", () => {
  const c = fecharCaixa({
    movs: [{ tipo: "entrada", valor: 500 }, { tipo: "saida", valor: 120 }],
    lancs: [{ type: "entrada", amount: 450 }, { type: "saida", amount: 120 }],
    saldoExtrato: 1000, saldoSistema: 940,
  });
  assert.deepEqual(c, { extEnt: 500, extSai: 120, sisEnt: 450, sisSai: 120, difEntradas: 50, difSaidas: 0, difPeriodo: 50, difSaldo: 60, bate: false });
  assert.equal(fecharCaixa({ movs: [], lancs: [], saldoExtrato: null, saldoSistema: 5 }).bate, true);
});

test("baixa pelo extrato: sem multa quando fecha com o valor base; senão com multa em ordem e a última parcial; sobra avisa", async () => {
  const { planoBaixa, sugerirParcelas } = await import("../lib/conciliacaoOfx.js");
  const ps = [
    { id: "a", amount: 100, valorPago: 0, devido: 150 },
    { id: "b", amount: 100, valorPago: 0, devido: 150 },
    { id: "c", amount: 100, valorPago: 20, devido: 100 },
  ];
  assert.deepEqual(planoBaixa(ps.slice(0, 2), 200), { itens: [{ id: "a", valor: 100, semJuros: true }, { id: "b", valor: 100, semJuros: true }], sobra: 0 });
  assert.deepEqual(planoBaixa(ps.slice(0, 2), 300), { itens: [{ id: "a", valor: 150, semJuros: false }, { id: "b", valor: 150, semJuros: false }], sobra: 0 });
  assert.deepEqual(planoBaixa(ps.slice(0, 2), 220), { itens: [{ id: "a", valor: 150, semJuros: false }, { id: "b", valor: 70, semJuros: false }], sobra: 0 }); // última parcial
  assert.equal(planoBaixa(ps.slice(0, 1), 400).sobra, 250); // Pix maior que o marcado
  assert.deepEqual(planoBaixa([ps[2]], 80).itens, [{ id: "c", valor: 80, semJuros: true }]); // já tinha R$ 20 pagos
  assert.deepEqual(sugerirParcelas(ps, 200), ["a", "b"]);
  assert.deepEqual(sugerirParcelas(ps, 150), ["a"]);
  assert.deepEqual(sugerirParcelas(ps, 77), []);
});

test("chave do pagador: mesmo nome em formatos diferentes do extrato dá a mesma chave", async () => {
  const { chaveDescricao } = await import("../lib/conciliacaoOfx.js");
  assert.equal(chaveDescricao("Pix Marileide Gonçalves de Lima Silva — Recebido"), chaveDescricao("Pix recebido — MARILEIDE GONCALVES DE LIMA"));
  assert.notEqual(chaveDescricao("Pix recebido — JOAO PEREIRA"), chaveDescricao("Pix recebido — MARIA PEREIRA"));
  assert.equal(chaveDescricao("Tarifa 12345"), "tarifa");
});

test("busca de cliente: sem acento, várias palavras, acha pela conversa e põe o mais provável primeiro", async () => {
  const { palavrasDaBusca, rankearClientes } = await import("../lib/buscaCliente.js");
  const tokens = palavrasDaBusca("Marileide Gonçalves");
  assert.deepEqual(tokens, ["marileide", "goncalves"]);
  const contatos = [
    { id: "1", name: "Antonella Silva Atacado", phone: "5516993099884", etapa: "Venda perdida" },
    { id: "2", name: "Marileide Gonçalves de Lima", phone: "5571999990000", etapa: "Recebimento" },
    { id: "3", name: "Bia Doces", phone: "5584999990000", etapa: "Recebimento" },
    { id: "4", name: "Marileide Souza", phone: "5511999990000", etapa: "Recebimento" },
  ];
  const mensagens = [
    { contactId: "3", body: "Oi, quem vai pagar é a Marileide Goncalves, minha mãe", createdAt: "2026-11-05" },
    { contactId: "1", body: "bom dia", createdAt: "2026-11-05" },
  ];
  const r = rankearClientes(tokens, contatos, mensagens);
  assert.deepEqual(r.map((x) => x.id), ["2", "3", "4"]); // nome completo > palavras na conversa > só uma palavra no nome
  assert.equal(r[0].completo, true);
  assert.equal(r[1].completo, true);
  assert.match(r[1].trecho, /Marileide Goncalves/);
  assert.equal(r[2].completo, false);
  assert.deepEqual(rankearClientes(palavrasDaBusca("5571999"), contatos, []).map((x) => x.id), ["2"]); // por telefone
  assert.deepEqual(rankearClientes([], contatos, []), []);
});

test("categoria parecida: reconhece o mesmo estabelecimento/pessoa mesmo com texto diferente, sem confundir sobrenome comum", async () => {
  const { categoriaParecida } = await import("../lib/conciliacaoOfx.js");
  const hist = [
    { descricao: "99Food *Cacique Burger — laplatainfinitcr", categoriaId: "alimentacao" },
    { descricao: "Pix HENRIQUE GEFFE MEDEIROS — Enviado", categoriaId: "kabrito" },
    { descricao: "Pix MARIA DA SILVA — Enviado", categoriaId: "outra" },
  ];
  assert.equal(categoriaParecida("99Food *Marmitas Fei — laplatainfinitcr", hist), "alimentacao");
  assert.equal(categoriaParecida("Pix recebido — HENRIQUE G MEDEIROS", hist), "kabrito");
  assert.equal(categoriaParecida("Pix JOAO DA SILVA — Enviado", hist), null); // "silva" sozinho não conta
  assert.equal(categoriaParecida("Tarifa", hist), null);
});
