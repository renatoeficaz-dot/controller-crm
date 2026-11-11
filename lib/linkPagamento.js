// Regras PURAS do link de pagamento InfinitePay (Checkout Integrado). Sem banco e sem rede: testado em tests/linkPagamento.test.mjs.
// Documentação: https://www.infinitepay.io/checkout-documentacao
//   POST https://api.checkout.infinitepay.io/links        { handle, items[{quantity, price (centavos), description}], order_nsu, webhook_url, redirect_url, customer, options }
//   POST https://api.checkout.infinitepay.io/payment_check { handle, order_nsu, transaction_nsu, slug } -> { success, paid, amount, paid_amount, capture_method }
// O webhook NÃO é assinado: toda notificação é confirmada no payment_check antes de dar baixa.

export const API_CHECKOUT = "https://api.checkout.infinitepay.io";
export const VALOR_MINIMO = 1; // R$ 1,00: mínimo da InfinitePay para qualquer pagamento

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const centavos = (reais) => Math.round(r2(reais) * 100);
export const reais = (cent) => r2((Number(cent) || 0) / 100);

// InfiniteTag sem "$", espaços ou "@"; só letras, números, ponto, hífen e sublinhado.
export function normalizarHandle(h) {
  const s = String(h || "").trim().replace(/^[@$]+/, "").toLowerCase();
  return /^[a-z0-9._-]{2,60}$/.test(s) ? s : null;
}

// Telefone no formato que a InfinitePay mostra no checkout (+55DDDNÚMERO).
function telefoneCheckout(phone) {
  const d = String(phone || "").replace(/\D/g, "");
  if (d.length === 12 || d.length === 13) return "+" + d;
  if (d.length === 10 || d.length === 11) return "+55" + d;
  return null;
}

// Corpo do POST /links. Parcelas: [{ number, valor }] já com o que falta pagar de cada uma (com multa, se atrasada).
// options (validade, uso único, só com Pix ligado) só vai quando há chave de API — sem ela a InfinitePay recusa "options".
// CEP (8 dígitos) achado no endereço do cadastro: "Av Joaquim Alves 18 Jardim primavera 14802424" -> "14802424".
export function cepDoEndereco(...textos) {
  for (const t of textos) {
    const m = String(t || "").match(/(?<!\d)(\d{5})-?(\d{3})(?!\d)/);
    if (m) return m[1] + m[2];
  }
  return null;
}

// Checkout rápido: nome, telefone, e-mail (padrão da configuração) e CEP já preenchidos — o cliente só toca em Continuar.
export function montarCorpoLink({ handle, orderNsu, contato, parcelas, webhookUrl, comApiKey = false, validadeAte = null, emailPadrao = null, cepPadrao = null }) {
  const h = normalizarHandle(handle);
  if (!h) throw new Error("InfiniteTag inválida.");
  const itens = (parcelas || []).filter((p) => r2(p.valor) > 0);
  if (!itens.length) throw new Error("Nada a cobrar nas parcelas escolhidas.");
  const total = r2(itens.reduce((s, p) => s + r2(p.valor), 0));
  if (total < VALOR_MINIMO) throw new Error(`O valor mínimo de um link é R$ ${VALOR_MINIMO.toFixed(2).replace(".", ",")}.`);
  const nome = String(contato?.name || "").split("\n")[0].trim().slice(0, 60);
  const corpo = {
    handle: h,
    order_nsu: orderNsu,
    items: itens.map((p) => ({ quantity: 1, price: centavos(p.valor), description: `Parcela ${p.number}ª${nome ? ` — ${nome}` : ""}`.slice(0, 120) })),
  };
  if (webhookUrl) corpo.webhook_url = webhookUrl;
  const tel = telefoneCheckout(contato?.phone);
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(emailPadrao || "").trim()) ? String(emailPadrao).trim().toLowerCase() : null;
  if (nome || tel || email) corpo.customer = { ...(nome ? { name: nome } : {}), ...(tel ? { phone_number: tel } : {}), ...(email ? { email } : {}) };
  const cep = cepDoEndereco(contato?.endereco, contato?.enderecoComercial) || cepDoEndereco(cepPadrao);
  if (cep) corpo.address = { cep };
  if (comApiKey) {
    corpo.options = { single_payment: true, ...(validadeAte ? { valid_until: new Date(validadeAte).toISOString() } : {}) };
  }
  return { corpo, total };
}

// A documentação não mostra a resposta do POST /links: procura a URL do checkout nos nomes prováveis e, por último, em qualquer
// campo que seja um link https.
export function extrairLink(resp) {
  if (!resp || typeof resp !== "object") return { url: null, slug: null };
  const cand = [resp.url, resp.link, resp.checkout_url, resp.payment_url, resp.data?.url, resp.data?.link, resp.data?.checkout_url];
  let url = cand.find((x) => typeof x === "string" && /^https:\/\//.test(x)) || null;
  if (!url) {
    const pilha = [resp];
    while (pilha.length && !url) {
      const o = pilha.pop();
      for (const v of Object.values(o || {})) {
        if (typeof v === "string" && /^https:\/\/\S+$/.test(v)) { url = v; break; }
        if (v && typeof v === "object") pilha.push(v);
      }
    }
  }
  const slug = resp.slug || resp.invoice_slug || resp.data?.slug || resp.data?.invoice_slug || null;
  return { url, slug };
}

// Webhook -> dados normalizados (valores em R$). Nada aqui é confiável até o payment_check confirmar.
export function lerWebhook(p) {
  if (!p || typeof p !== "object") return null;
  const orderNsu = String(p.order_nsu || "").trim();
  const transactionNsu = String(p.transaction_nsu || "").trim();
  const slug = String(p.invoice_slug || p.slug || "").trim();
  if (!orderNsu || !transactionNsu) return null;
  return {
    orderNsu,
    transactionNsu,
    slug,
    valor: reais(p.amount),
    valorPago: reais(p.paid_amount ?? p.amount),
    metodo: p.capture_method === "credit_card" ? "credit_card" : p.capture_method === "pix" ? "pix" : String(p.capture_method || ""),
    receiptUrl: typeof p.receipt_url === "string" ? p.receipt_url : null,
  };
}

// Quanto entra na baixa: o valor do link (o que cobramos), nunca mais que isso. paid_amount pode vir maior quando a taxa do cartão é
// repassada ao comprador — esse excedente é da InfinitePay, não pagamento de parcela.
export function valorParaBaixa({ valorLink, confirmado }) {
  const pago = reais(confirmado?.amount ?? 0) || valorLink;
  return r2(Math.min(valorLink, pago));
}

// Mensagem do WhatsApp com o link (sem emoji: cobrança nunca usa).
// primeira = é o primeiro link que esse cliente recebe: a mensagem avisa que agora a cobrança vem por link, todo dia.
export const AVISO_PRIMEIRO_LINK = "Agora estamos enviando o link de pagamento para você. Segue o seu link abaixo, todo dia vou te enviar assim.";
export function mensagemLink({ url, total, parcelas, primeira = false }) {
  const ps = (parcelas || []).map((p) => `${p.number}ª`);
  const qual = ps.length > 1 ? `parcelas ${ps.join(", ")}` : `parcela ${ps[0] || ""}`.trim();
  const valor = r2(total).toFixed(2).replace(".", ",");
  const corpo = `Link para pagamento da ${qual} - R$ ${valor}:\n${url}\n\nPode pagar por Pix (QR Code ou copia e cola) direto no link. A baixa é automática.`;
  return primeira ? `${AVISO_PRIMEIRO_LINK}\n\n${corpo}` : corpo;
}

// Comprovante que a IA leu é do mesmo pagamento de um link já pago? (mesmo cliente, mesmo valor, até 12 h depois do pagamento)
export function comprovanteDeLinkPago({ valorComprovante, linksPagos, agora = new Date() }) {
  const v = r2(valorComprovante);
  return (linksPagos || []).some((l) => l.pagoEm && agora - new Date(l.pagoEm) <= 12 * 3600e3 && Math.abs(r2(l.valorPago ?? l.valor) - v) <= 0.01);
}
