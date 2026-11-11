// Link de pagamento InfinitePay de ponta a ponta num SQLite isolado, com a API da InfinitePay simulada (nada sai para a rede):
// gera o link → webhook → payment_check → baixa + lançamento; webhook repetido não baixa em dobro; webhook não confirmado não baixa;
// comprovante do mesmo pagamento é reconhecido.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

process.env.TZ = "America/Sao_Paulo";
process.env.APP_URL = "https://controller.teste";
const pasta = mkdtempSync(join(tmpdir(), "controller-link-"));
writeFileSync(join(pasta, "teste.db"), "");
const url = `file:${join(pasta, "teste.db").replaceAll("\\", "/")}`;
process.env.DATABASE_URL = url;
const preparar = spawnSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "db", "push", "--skip-generate"], { env: { ...process.env, DATABASE_URL: url }, encoding: "utf8" });
assert.equal(preparar.status, 0, preparar.stderr);

const { prisma } = await import("../lib/prisma.js");
const LP = await import("../lib/linkPagamentoServidor.js");
const { comprovanteDeLinkPago } = await import("../lib/linkPagamento.js");

// InfinitePay simulada
const chamadas = [];
let pagos = new Set(); // transaction_nsu que o payment_check confirma
const fetchOriginal = globalThis.fetch;
globalThis.fetch = async (u, init) => {
  const corpo = JSON.parse(init?.body || "{}");
  chamadas.push({ u: String(u), corpo });
  if (String(u).endsWith("/links")) return new Response(JSON.stringify({ url: `https://checkout.infinitepay.io/capcred/${corpo.order_nsu}`, slug: "slug-" + corpo.order_nsu }), { status: 200 });
  if (String(u).endsWith("/payment_check")) {
    const ok = pagos.has(corpo.transaction_nsu);
    return new Response(JSON.stringify({ success: ok, paid: ok, amount: 5400, paid_amount: 5400, capture_method: "pix" }), { status: 200 });
  }
  return new Response("{}", { status: 404 });
};

let contato, p1, p2;
before(async () => {
  const banco = await prisma.banco.create({ data: { name: "InfinitePay" } });
  await prisma.config.create({ data: { id: "singleton", infinitepayHandle: "capcred", contaRecebimentoId: banco.id, multaPct: 50 } });
  const st = await prisma.stage.create({ data: { name: "Recebimento", order: 1 } });
  contato = await prisma.contact.create({ data: { name: "Cliente Link", phone: "5516999990000", stageId: st.id, valorCapital: 300 } });
  const amanha = new Date(Date.now() + 86400e3).toISOString().slice(0, 10);
  const depois = new Date(Date.now() + 2 * 86400e3).toISOString().slice(0, 10);
  p1 = await prisma.parcela.create({ data: { contactId: contato.id, number: 1, amount: 54, dueDate: new Date(amanha + "T00:00:00Z") } });
  p2 = await prisma.parcela.create({ data: { contactId: contato.id, number: 2, amount: 54, dueDate: new Date(depois + "T00:00:00Z") } });
});
after(async () => {
  globalThis.fetch = fetchOriginal;
  await prisma.$disconnect();
});

test("gera o link (itens em centavos, order_nsu = id, webhook com token) e reaproveita o mesmo no mesmo dia", async () => {
  const r = await LP.gerarLink({ contactId: contato.id, parcelaIds: [p1.id], origem: "manual", usuario: "Arthur" });
  assert.equal(r.link.valor, 54);
  assert.match(r.link.url, /^https:\/\/checkout\.infinitepay\.io\/capcred\//);
  const post = chamadas.find((c) => c.u.endsWith("/links")).corpo;
  assert.equal(post.handle, "capcred");
  assert.equal(post.order_nsu, r.link.id);
  assert.deepEqual(post.items.map((i) => i.price), [5400]);
  assert.match(post.webhook_url, /^https:\/\/controller\.teste\/api\/webhook\/infinitepay\?t=[a-f0-9]{48}$/);
  const de_novo = await LP.gerarLink({ contactId: contato.id, parcelaIds: [p1.id], origem: "manual", usuario: "Arthur" });
  assert.equal(de_novo.reaproveitado, true);
  assert.equal(de_novo.link.id, r.link.id);
});

test("primeiro link enviado ao cliente leva o aviso; o seguinte vai só com o link", async () => {
  const link = await prisma.cobrancaLink.findFirst({ where: { contactId: contato.id } });
  // WhatsApp sem configuração no teste = envio simulado; o texto fica gravado na conversa
  await LP.enviarLinkWhatsapp({ link, parcelas: [{ number: 1 }], contato });
  const depois = await prisma.cobrancaLink.findUnique({ where: { id: link.id } });
  await LP.enviarLinkWhatsapp({ link: depois, parcelas: [{ number: 1 }], contato });
  const msgs = await prisma.message.findMany({ where: { contactId: contato.id }, orderBy: { createdAt: "asc" } });
  assert.equal(msgs.length, 2);
  assert.match(msgs[0].body, /^Agora estamos enviando o link de pagamento/);
  assert.match(msgs[1].body, /^Link para pagamento da parcela 1ª/);
});

test("webhook sem confirmação no payment_check NÃO dá baixa", async () => {
  const link = await prisma.cobrancaLink.findFirst({ where: { contactId: contato.id } });
  const r = await LP.processarWebhook({ order_nsu: link.id, transaction_nsu: "falso", invoice_slug: link.slug, amount: 5400, capture_method: "pix" });
  assert.equal(r.ok, false);
  assert.equal((await prisma.parcela.findUnique({ where: { id: p1.id } })).paid, false);
});

test("webhook confirmado: baixa a parcela, cria o lançamento na conta de recebimento; repetido não baixa de novo", async () => {
  const link = await prisma.cobrancaLink.findFirst({ where: { contactId: contato.id } });
  pagos.add("tx-1");
  const payload = { order_nsu: link.id, transaction_nsu: "tx-1", invoice_slug: link.slug, amount: 5400, paid_amount: 5400, capture_method: "pix", receipt_url: "https://r/1" };
  const [a, b] = await Promise.all([LP.processarWebhook(payload), LP.processarWebhook(payload)]);
  assert.equal(a.ok && b.ok, true);
  assert.deepEqual([a.motivo, b.motivo].sort(), ["baixado", "já baixado"]);
  const par = await prisma.parcela.findUnique({ where: { id: p1.id } });
  assert.equal(par.paid, true);
  assert.equal(par.baixadoPor, "Arthur", "link manual credita quem gerou");
  const lancs = await prisma.lancamento.findMany({ where: { contactId: contato.id, type: "entrada" } });
  assert.equal(lancs.length, 1);
  assert.equal(lancs[0].amount, 54);
  assert.match(lancs[0].description, /Link InfinitePay \[lnk:/);
  assert.ok(lancs[0].bancoId, "lançamento na conta de recebimento");
  assert.equal((await prisma.parcela.findUnique({ where: { id: p2.id } })).paid, false, "a parcela 2 não foi tocada");
  const l = await prisma.cobrancaLink.findUnique({ where: { id: link.id } });
  assert.equal(l.status, "pago");
  assert.equal(l.metodo, "pix");
  // Mesmo pagamento chegando como comprovante na conversa: reconhecido (a IA não dá outra baixa)
  assert.equal(comprovanteDeLinkPago({ valorComprovante: 54, linksPagos: await LP.linksPagosRecentes(contato.id) }), true);
});

test("link pago depois que a parcela já tinha sido baixada por outro caminho: vai para a próxima parcela e abre tarefa", async () => {
  const r = await LP.gerarLink({ contactId: contato.id, parcelaIds: [p2.id], origem: "auto" });
  await prisma.parcela.update({ where: { id: p2.id }, data: { paid: true, paidAt: new Date(), amountPago: 54, valorPago: 54 } });
  const p3 = await prisma.parcela.create({ data: { contactId: contato.id, number: 3, amount: 54, dueDate: new Date(Date.now() + 3 * 86400e3) } });
  pagos.add("tx-2");
  const res = await LP.processarWebhook({ order_nsu: r.link.id, transaction_nsu: "tx-2", invoice_slug: r.link.slug, amount: 5400, capture_method: "pix" });
  assert.equal(res.motivo, "baixado");
  assert.equal((await prisma.parcela.findUnique({ where: { id: p3.id } })).paid, true);
  assert.equal((await prisma.parcela.findUnique({ where: { id: p3.id } })).baixadoPor, "IA", "link automático credita a IA");
  assert.ok(await prisma.task.findFirst({ where: { contactId: contato.id, title: { startsWith: "Conferir link pago" } } }));
});
