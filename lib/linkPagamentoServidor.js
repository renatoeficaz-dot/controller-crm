// Link de pagamento InfinitePay (Checkout Integrado) — lado do servidor: gera o link de uma ou mais parcelas, manda no WhatsApp e,
// quando o webhook avisa, CONFIRMA no payment_check e dá a baixa (aplicarBaixaParcial → lançamento de entrada na conta de recebimento).
// Regras puras em lib/linkPagamento.js. Nada aqui lança para quem chamou sem motivo claro; falha de rede vira erro legível.
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { decifrar } from "@/lib/segredo";
import { valorParcelaAtual, horaLimiteEfetiva } from "@/lib/finance";
import { API_CHECKOUT, montarCorpoLink, extrairLink, lerWebhook, valorParaBaixa, mensagemLink, normalizarHandle } from "@/lib/linkPagamento";

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const diaBR = (d = new Date()) => new Date(d).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

export async function configLink() {
  const c = await prisma.config.findUnique({ where: { id: "singleton" } });
  return {
    cfg: c,
    handle: normalizarHandle(c?.infinitepayHandle),
    apiKey: decifrar(c?.infinitepayApiKeyEnc),
    autoAtivo: !!c?.infinitepayAutoAtivo,
    enviarChave: c?.infinitepayEnviarChave !== false,
    avisoPago: !!c?.infinitepayAvisoPago,
  };
}

async function webhookUrl(origem) {
  const c = await prisma.config.findUnique({ where: { id: "singleton" }, select: { infinitepayWebhookToken: true } });
  let token = c?.infinitepayWebhookToken;
  if (!token) {
    token = crypto.randomBytes(24).toString("hex");
    await prisma.config.update({ where: { id: "singleton" }, data: { infinitepayWebhookToken: token } });
  }
  const base = (process.env.APP_URL || origem || "").replace(/\/$/, "");
  return base.startsWith("https://") ? `${base}/api/webhook/infinitepay?t=${token}` : null;
}

async function chamar(caminho, corpo, apiKey) {
  const r = await fetch(`${API_CHECKOUT}${caminho}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(apiKey ? { "X-Api-Key": apiKey } : {}) },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(20000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`InfinitePay ${r.status}: ${String(j?.message || j?.error || "erro").slice(0, 200)}`);
  return j;
}

// Quanto falta em cada parcela (com multa se atrasada), na ordem de vencimento.
async function parcelasACobrar(contactId, parcelaIds, cfg) {
  const contato = await prisma.contact.findUnique({ where: { id: contactId }, select: { id: true, name: true, phone: true, tipoCliente: true, horarioRecebimento: true, excluidoEm: true, endereco: true, enderecoComercial: true } });
  if (!contato || contato.excluidoEm) throw new Error("Cliente não encontrado.");
  const ps = await prisma.parcela.findMany({ where: { id: { in: parcelaIds }, contactId, paid: false, renegociada: false }, orderBy: [{ dueDate: "asc" }, { number: "asc" }] });
  if (ps.length !== new Set(parcelaIds).size) throw new Error("Alguma parcela já foi paga ou não é desse cliente. Atualize e tente de novo.");
  const opts = { multaPct: cfg?.multaPct, horaLimite: horaLimiteEfetiva(contato, cfg) };
  return { contato, parcelas: ps.map((p) => ({ id: p.id, number: p.number, valor: r2(Math.max(0, valorParcelaAtual(p, undefined, opts) - (p.valorPago || 0))) })) };
}

// Gera (ou reaproveita, se já existe um aberto de hoje com as mesmas parcelas e o mesmo valor) o link de pagamento.
export async function gerarLink({ contactId, parcelaIds, origem = "manual", usuario = null, origemUrl = null }) {
  const { cfg, handle, apiKey } = await configLink();
  if (!handle) throw new Error("Cadastre a InfiniteTag em Configurações › Conta bancária › Link de pagamento.");
  const { contato, parcelas } = await parcelasACobrar(contactId, parcelaIds, cfg);
  const total = r2(parcelas.reduce((s, p) => s + p.valor, 0));
  const ids = parcelas.map((p) => p.id).join(",");
  const dia = diaBR();
  const igual = await prisma.cobrancaLink.findFirst({ where: { contactId, parcelaIds: ids, dia, status: "aberto", valor: total, url: { not: null } }, orderBy: { createdAt: "desc" } });
  if (igual) return { link: igual, parcelas, contato, reaproveitado: true };

  const link = await prisma.cobrancaLink.create({ data: { contactId, parcelaIds: ids, valor: total, origem, criadoPor: usuario, dia } });
  try {
    // Com chave de API: vale até o fim do dia seguinte e aceita um pagamento só.
    const validadeAte = new Date(`${dia}T23:59:00-03:00`).getTime() + 86400e3;
    const { corpo } = montarCorpoLink({ handle, orderNsu: link.id, contato, parcelas, webhookUrl: await webhookUrl(origemUrl), comApiKey: !!apiKey, validadeAte, emailPadrao: cfg?.infinitepayEmailPadrao, cepPadrao: cfg?.infinitepayCepPadrao });
    const resp = await chamar("/links", corpo, apiKey);
    const { url, slug } = extrairLink(resp);
    if (!url) throw new Error("A InfinitePay não devolveu o endereço do link.");
    const salvo = await prisma.cobrancaLink.update({ where: { id: link.id }, data: { url, slug, descricao: corpo.items.map((i) => i.description).join(" | ").slice(0, 300) } });
    await prisma.auditLog.create({ data: { usuario: usuario || "Automático", acao: "gerar_link_pagamento", entidade: "CobrancaLink", entidadeId: link.id, detalhe: `${contato.name}: R$ ${total.toFixed(2)} (${parcelas.map((p) => p.number + "ª").join(", ")})` } }).catch(() => {});
    return { link: salvo, parcelas, contato, reaproveitado: false };
  } catch (e) {
    await prisma.cobrancaLink.update({ where: { id: link.id }, data: { status: "erro", erro: String(e.message).slice(0, 300) } }).catch(() => {});
    throw e;
  }
}

// Manda o link no WhatsApp do cliente (pela instância da conversa dele) e registra a mensagem no chat.
export async function enviarLinkWhatsapp({ link, parcelas, contato, enviadoPor = "Automático", instancia = null }) {
  const { sendWhatsappText, resolveInstanceForContact, semEmoji } = await import("@/lib/evolution");
  // Primeiro link que o cliente recebe (nenhum outro enviado antes): a mensagem traz o aviso de que agora é assim todo dia.
  const jaRecebeu = await prisma.cobrancaLink.findFirst({ where: { contactId: contato.id, enviadoEm: { not: null }, id: { not: link.id } }, select: { id: true } });
  const primeira = !jaRecebeu && !link.enviadoEm;
  const texto = semEmoji(mensagemLink({ url: link.url, total: link.valor, parcelas, primeira }));
  const inst = instancia || (await resolveInstanceForContact(contato.id));
  const r = await sendWhatsappText(contato.phone, texto, inst);
  if (r.ok || r.simulated) await prisma.cobrancaLink.update({ where: { id: link.id }, data: { enviadoEm: new Date() } }).catch(() => {});
  await prisma.message.create({ data: { enviadoPor, contactId: contato.id, body: texto, kind: "text", fromMe: true, status: r.simulated ? "simulado" : r.ok ? "enviado" : "erro", instance: inst } }).catch(() => {});
  return r;
}

// Confirma na InfinitePay (o webhook não é assinado: sem isso qualquer um daria baixa).
async function confirmar({ handle, apiKey, orderNsu, transactionNsu, slug }) {
  const j = await chamar("/payment_check", { handle, order_nsu: orderNsu, transaction_nsu: transactionNsu, slug }, apiKey);
  return j?.success === true && j?.paid === true ? j : null;
}

let fila = Promise.resolve();
// Webhook da InfinitePay → baixa. Idempotente por transaction_nsu. Devolve { ok, motivo }.
export function processarWebhook(payload) {
  const p = (fila = fila.then(() => processar(payload)).catch((e) => ({ ok: false, motivo: e.message })));
  return p;
}

async function processar(payload) {
  const w = lerWebhook(payload);
  if (!w) return { ok: false, motivo: "payload sem order_nsu/transaction_nsu" };
  const link = await prisma.cobrancaLink.findUnique({ where: { id: w.orderNsu } });
  if (!link) return { ok: false, motivo: "link desconhecido" };
  if (link.status === "pago") return { ok: true, motivo: link.transactionNsu === w.transactionNsu ? "já baixado" : "link já pago por outra transação" };
  const { cfg, handle, apiKey, avisoPago } = await configLink();
  const conf = await confirmar({ handle, apiKey, orderNsu: link.id, transactionNsu: w.transactionNsu, slug: w.slug || link.slug });
  if (!conf) return { ok: false, motivo: "payment_check não confirmou o pagamento" };

  // Marca o link como pago ANTES da baixa (transactionNsu é único): duas entregas do mesmo webhook não dão baixa em dobro.
  try {
    await prisma.cobrancaLink.update({ where: { id: link.id, status: "aberto" }, data: { status: "pago", transactionNsu: w.transactionNsu, metodo: conf.capture_method || w.metodo, valorPago: r2((conf.paid_amount ?? conf.amount) / 100), pagoEm: new Date(), receiptUrl: w.receiptUrl, slug: w.slug || link.slug } });
  } catch {
    return { ok: true, motivo: "já baixado" };
  }

  const valor = valorParaBaixa({ valorLink: link.valor, confirmado: conf });
  const ids = link.parcelaIds.split(",").filter(Boolean);
  const { aplicarBaixaParcial } = await import("@/lib/baixaParcial");
  const quem = link.origem === "manual" && link.criadoPor ? link.criadoPor : "IA";
  const forma = (conf.capture_method || w.metodo) === "credit_card" ? "cartao" : "pix";
  const t0 = new Date(Date.now() - 1000);
  const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date());
  // Começa na 1ª parcela do link ainda em aberto; o que sobrar a baixaParcial leva para as próximas (adiantamento).
  let restante = valor;
  const notas = [];
  for (const id of ids) {
    if (restante <= 0.004) break;
    const par = await prisma.parcela.findUnique({ where: { id } });
    if (!par || par.paid) continue;
    const r = await aplicarBaixaParcial({ id, valor: restante, formaPagamento: forma, usuarioNome: quem, origem: `Link InfinitePay [lnk:${link.id}]`, horaPagamento: hora, pagoEm: new Date() });
    if (r?.erro) { notas.push(r.erro); continue; }
    restante = 0; // a própria baixa parcial distribui o excedente nas parcelas seguintes
  }
  if (restante > 0.004) {
    // Todas as parcelas do link já estavam pagas (o cliente pagou por outro caminho também): vira adiantamento da próxima em aberto.
    const prox = await prisma.parcela.findFirst({ where: { contactId: link.contactId, paid: false, renegociada: false }, orderBy: [{ dueDate: "asc" }, { number: "asc" }] });
    if (prox) {
      await aplicarBaixaParcial({ id: prox.id, valor: restante, formaPagamento: forma, usuarioNome: quem, origem: `Link InfinitePay [lnk:${link.id}] (parcelas do link já estavam pagas)`, horaPagamento: hora, pagoEm: new Date() });
      notas.push("parcelas do link já estavam pagas — valor foi para a próxima parcela");
    } else notas.push("cliente sem parcela em aberto — pagamento ficou sem baixa");
  }
  // Lançamentos criados pela baixa: na conta de recebimento e já conferidos (o dinheiro veio confirmado pela InfinitePay).
  await prisma.lancamento.updateMany({ where: { contactId: link.contactId, type: "entrada", createdAt: { gte: t0 }, description: { contains: `[lnk:${link.id}]` } }, data: { bancoId: cfg?.contaRecebimentoId || undefined } }).catch(() => {});
  await prisma.auditLog.create({ data: { usuario: "InfinitePay", acao: "baixa_link_pagamento", entidade: "CobrancaLink", entidadeId: link.id, detalhe: `R$ ${valor.toFixed(2)} via ${forma}${notas.length ? " — " + notas.join("; ") : ""}` } }).catch(() => {});
  if (notas.length) await avisarEquipe(link, notas).catch(() => {});
  if (avisoPago) {
    const contato = await prisma.contact.findUnique({ where: { id: link.contactId }, select: { id: true, phone: true } });
    if (contato) {
      const { sendWhatsappText, resolveInstanceForContact } = await import("@/lib/evolution");
      const inst = await resolveInstanceForContact(contato.id);
      const texto = `Pagamento de R$ ${valor.toFixed(2).replace(".", ",")} recebido. Obrigado!`;
      const r = await sendWhatsappText(contato.phone, texto, inst);
      await prisma.message.create({ data: { enviadoPor: "Automático", contactId: contato.id, body: texto, kind: "text", fromMe: true, status: r.ok ? "enviado" : "erro", instance: inst } }).catch(() => {});
    }
  }
  return { ok: true, motivo: "baixado", valor };
}

async function avisarEquipe(link, notas) {
  const ja = await prisma.task.findFirst({ where: { contactId: link.contactId, done: false, title: { startsWith: "Conferir link pago" } } });
  if (ja) return;
  await prisma.task.create({ data: { contactId: link.contactId, title: "Conferir link pago (InfinitePay)", notes: `Link ${link.id} pago (R$ ${link.valor.toFixed(2)}). ${notas.join("; ")}.`, dueDate: new Date() } });
}

// Links pagos recentes do cliente (para a IA não dar baixa de novo pelo comprovante do mesmo pagamento).
export async function linksPagosRecentes(contactId) {
  return prisma.cobrancaLink.findMany({ where: { contactId, status: "pago", pagoEm: { gte: new Date(Date.now() - 12 * 3600e3) } }, select: { valor: true, valorPago: true, pagoEm: true } });
}
