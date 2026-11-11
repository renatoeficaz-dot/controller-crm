// Regras puras do link de pagamento InfinitePay (lib/linkPagamento.js).
import test from "node:test";
import assert from "node:assert/strict";
import { cepDoEndereco, normalizarHandle, montarCorpoLink, extrairLink, lerWebhook, valorParaBaixa, mensagemLink, comprovanteDeLinkPago, centavos } from "../lib/linkPagamento.js";

test("InfiniteTag: tira $/@, minúsculas, recusa inválida", () => {
  assert.equal(normalizarHandle("$Capcred"), "capcred");
  assert.equal(normalizarHandle(" @capcred.sp "), "capcred.sp");
  assert.equal(normalizarHandle("com espaço"), null);
  assert.equal(normalizarHandle(""), null);
});

test("centavos sem erro de arredondamento", () => {
  assert.equal(centavos(54), 5400);
  assert.equal(centavos(59.4), 5940);
  assert.equal(centavos(73.33), 7333);
});

test("corpo do link: itens em centavos, order_nsu, webhook, cliente; options só com chave de API", () => {
  const { corpo, total } = montarCorpoLink({
    handle: "$capcred", orderNsu: "lnk1", webhookUrl: "https://x/api/webhook/infinitepay?t=a",
    contato: { name: "Bruna Maria Cola\nSalão", phone: "5516999998888" },
    parcelas: [{ number: 2, valor: 59.4 }, { number: 3, valor: 54 }],
  });
  assert.equal(total, 113.4);
  assert.equal(corpo.handle, "capcred");
  assert.equal(corpo.order_nsu, "lnk1");
  assert.deepEqual(corpo.items.map((i) => i.price), [5940, 5400]);
  assert.equal(corpo.items[0].description, "Parcela 2ª — Bruna Maria Cola");
  assert.equal(corpo.customer.phone_number, "+5516999998888");
  assert.equal(corpo.options, undefined, "sem chave de API não manda options");
  const com = montarCorpoLink({ handle: "capcred", orderNsu: "x", contato: {}, parcelas: [{ number: 1, valor: 54 }], comApiKey: true, validadeAte: "2026-11-12T03:00:00Z" });
  assert.equal(com.corpo.options.single_payment, true);
  assert.equal(com.corpo.options.valid_until, "2026-11-12T03:00:00.000Z");
  assert.throws(() => montarCorpoLink({ handle: "capcred", orderNsu: "x", contato: {}, parcelas: [{ number: 1, valor: 0.5 }] }), /mínimo/);
  assert.throws(() => montarCorpoLink({ handle: "", orderNsu: "x", contato: {}, parcelas: [{ number: 1, valor: 54 }] }), /InfiniteTag/);
});

test("resposta do POST /links: acha a URL em vários formatos", () => {
  assert.equal(extrairLink({ url: "https://checkout.infinitepay.io/capcred/abc" }).url, "https://checkout.infinitepay.io/capcred/abc");
  assert.equal(extrairLink({ data: { link: "https://pay.x/1" } }).url, "https://pay.x/1");
  assert.equal(extrairLink({ foo: { bar: "https://pay.x/2" }, slug: "s1" }).url, "https://pay.x/2");
  assert.equal(extrairLink({ foo: { bar: "https://pay.x/2" }, slug: "s1" }).slug, "s1");
  assert.equal(extrairLink(null).url, null);
});

test("webhook: valores em reais, método, e recusa sem order_nsu/transaction_nsu", () => {
  const w = lerWebhook({ invoice_slug: "abc", amount: 5940, paid_amount: 5940, capture_method: "pix", transaction_nsu: "t1", order_nsu: "lnk1", receipt_url: "https://r" });
  assert.deepEqual(w, { orderNsu: "lnk1", transactionNsu: "t1", slug: "abc", valor: 59.4, valorPago: 59.4, metodo: "pix", receiptUrl: "https://r" });
  assert.equal(lerWebhook({ amount: 100 }), null);
});

test("baixa: nunca mais que o valor do link (taxa do cartão repassada não vira parcela)", () => {
  assert.equal(valorParaBaixa({ valorLink: 54, confirmado: { amount: 5400, paid_amount: 5600 } }), 54);
  assert.equal(valorParaBaixa({ valorLink: 54, confirmado: { amount: 5000 } }), 50);
  assert.equal(valorParaBaixa({ valorLink: 54, confirmado: {} }), 54);
});

test("mensagem do link: parcelas, valor com vírgula, sem emoji", () => {
  const m = mensagemLink({ url: "https://pay.x/1", total: 113.4, parcelas: [{ number: 2 }, { number: 3 }] });
  assert.match(m, /parcelas 2ª, 3ª - R\$ 113,40:\nhttps:\/\/pay\.x\/1/);
  assert.equal(m.startsWith("Agora"), false, "nos dias seguintes vai só o link");
  const p1 = mensagemLink({ url: "https://pay.x/1", total: 54, parcelas: [{ number: 5 }], primeira: true });
  assert.match(p1, /^Agora estamos enviando o link de pagamento para você\. Segue o seu link abaixo, todo dia vou te enviar assim\.\n\nLink para pagamento da parcela 5ª - R\$ 54,00:/);
  assert.equal(/[\u{1F300}-\u{1FAFF}]/u.test(m), false);
});

test("comprovante do mesmo pagamento de um link pago não vira outra baixa", () => {
  const agora = new Date("2026-11-11T15:00:00Z");
  const links = [{ valor: 54, valorPago: 54, pagoEm: "2026-11-11T14:50:00Z" }];
  assert.equal(comprovanteDeLinkPago({ valorComprovante: 54, linksPagos: links, agora }), true);
  assert.equal(comprovanteDeLinkPago({ valorComprovante: 60, linksPagos: links, agora }), false);
  assert.equal(comprovanteDeLinkPago({ valorComprovante: 54, linksPagos: [{ ...links[0], pagoEm: "2026-11-10T10:00:00Z" }], agora }), false, "pagamento de ontem é outro");
});

test("checkout preenchido: e-mail padrão e CEP do endereço do cliente (ou o padrão)", () => {
  assert.equal(cepDoEndereco("Av Joaquim Alves 18 Jardim primavera 14802424"), "14802424");
  assert.equal(cepDoEndereco("Rua X, 10 - CEP 13.010-120"), null, "CEP com ponto não é aceito como número solto");
  assert.equal(cepDoEndereco("Rua Y 99, 13010-120 Campinas"), "13010120");
  assert.equal(cepDoEndereco("sem cep", "Comercial 01310100"), "01310100");
  assert.equal(cepDoEndereco("tel 11999998888"), null, "telefone não vira CEP");
  const { corpo } = montarCorpoLink({ handle: "capcred", orderNsu: "o", contato: { name: "Ana", phone: "11999998888", endereco: "Rua A 1 14802424" }, parcelas: [{ number: 1, valor: 54 }], emailPadrao: "Pagamentos@Empresa.com", cepPadrao: "01310100" });
  assert.equal(corpo.customer.email, "pagamentos@empresa.com");
  assert.deepEqual(corpo.address, { cep: "14802424" });
  const sem = montarCorpoLink({ handle: "capcred", orderNsu: "o", contato: { name: "Ana" }, parcelas: [{ number: 1, valor: 54 }], cepPadrao: "01310-100" }).corpo;
  assert.deepEqual(sem.address, { cep: "01310100" });
  assert.equal(sem.customer.email, undefined);
});
