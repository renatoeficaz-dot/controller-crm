// Cliente da API OFICIAL do WhatsApp (WABA — WhatsApp Business Platform / Cloud API, da Meta).
// Cada número WhatsappNumber com provider="waba" guarda o phone_number_id, a conta (WABA id) e o token de acesso.
// Credenciais do app (App ID/Secret, Verify Token, Config ID do Cadastro Integrado, template fora da janela)
// ficam em Configuração. Coexistência = o número continua no app WhatsApp Business do celular: o que for enviado
// pelo app chega aqui como "eco" (campo smb_message_echoes do webhook) e é gravado como mensagem enviada pelo celular.
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { onlyDigits, normalizeBrPhone } from "@/lib/evolution";

const JANELA_MS = 24 * 3600e3;

export async function getWabaConfig() {
  const cfg = await prisma.config.findUnique({ where: { id: "singleton" } }).catch(() => null);
  return {
    appId: cfg?.wabaAppId || "",
    appSecret: cfg?.wabaAppSecret || "",
    verifyToken: cfg?.wabaVerifyToken || "",
    configId: cfg?.wabaConfigId || "",
    version: cfg?.wabaGraphVersion || "v23.0",
    templateFora: cfg?.wabaTemplateForaJanela || "",
    idioma: cfg?.wabaTemplateIdioma || "pt_BR",
  };
}

async function numeroPorInstancia(instance) {
  if (!instance) return null;
  return prisma.whatsappNumber.findFirst({ where: { instance, provider: "waba" } }).catch(() => null);
}

async function fetchComTimeout(url, options, ms = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// Chamada genérica à Graph API. `token` é o token de acesso do número (ou do app, no cadastro integrado).
export async function graph(path, { method = "GET", token, body, form, query } = {}) {
  const { version } = await getWabaConfig();
  const qs = query ? "?" + new URLSearchParams(query).toString() : "";
  const url = `https://graph.facebook.com/${version}/${String(path).replace(/^\//, "")}${qs}`;
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
  try {
    const res = await fetchComTimeout(url, { method, headers, body: payload }, 25000);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, error: data?.error?.message || `Meta respondeu ${res.status}`, code: data?.error?.code, data };
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.name === "AbortError" ? "A Meta demorou demais para responder." : err.message };
  }
}

// Texto do template: a API só aceita parâmetros sem quebra de linha/tab e sem 4+ espaços seguidos.
function paramTemplate(texto) {
  return String(texto || "").replace(/[\r\n\t]+/g, " ").replace(/ {4,}/g, "   ").trim().slice(0, 1000);
}

// A janela de 24h é POR NÚMERO da empresa: conta a última mensagem RECEBIDA do cliente neste número.
async function dentroDaJanela(phone, instance) {
  const tail = onlyDigits(phone).slice(-8);
  if (!tail) return false;
  const msg = await prisma.message.findFirst({
    where: { fromMe: false, instance, contact: { phone: { endsWith: tail } } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  }).catch(() => null);
  return !!msg && Date.now() - msg.createdAt.getTime() < JANELA_MS;
}

function destino(phone) {
  // A Meta aceita o número com ou sem o 9 (usa o wa_id real). Mandamos como está, só dígitos.
  return normalizeBrPhone(phone) || onlyDigits(phone);
}

async function enviar(num, body) {
  if (!num?.wabaPhoneNumberId || !num?.wabaAccessToken) return { ok: false, error: "Número WABA sem Phone Number ID ou token de acesso." };
  const r = await graph(`${num.wabaPhoneNumberId}/messages`, { method: "POST", token: num.wabaAccessToken, body: { messaging_product: "whatsapp", recipient_type: "individual", ...body } });
  if (!r.ok) return r;
  return { ok: true, data: { key: { id: r.data?.messages?.[0]?.id }, ...r.data } };
}

export async function sendWhatsappTextWaba(phone, text, instance) {
  const num = await numeroPorInstancia(instance);
  if (!num) return { ok: false, error: "Número WABA não encontrado." };
  const to = destino(phone);
  if (!to) return { ok: false, error: "Contato sem telefone." };
  if (await dentroDaJanela(phone, instance)) {
    return enviar(num, { to, type: "text", text: { preview_url: false, body: String(text).slice(0, 4096) } });
  }
  // Fora da janela de 24h só template aprovado pela Meta. O texto vai como variável {{1}} do template.
  const cfg = await getWabaConfig();
  const template = num.wabaTemplateForaJanela || cfg.templateFora;
  if (!template) {
    return { ok: false, error: "Fora da janela de 24h: configure um template aprovado (Configurações → Números → WABA) para falar com este cliente." };
  }
  return enviar(num, {
    to,
    type: "template",
    template: { name: template, language: { code: cfg.idioma }, components: [{ type: "body", parameters: [{ type: "text", text: paramTemplate(text) || "." }] }] },
  });
}

async function subirMidia(num, { base64, mimetype, fileName }) {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mimetype);
  form.append("file", new Blob([Buffer.from(base64, "base64")], { type: mimetype }), fileName || "arquivo");
  const r = await graph(`${num.wabaPhoneNumberId}/media`, { method: "POST", token: num.wabaAccessToken, form });
  return r.ok ? { id: r.data?.id } : r;
}

export async function sendWhatsappMediaWaba(phone, { base64, mimetype, fileName, caption, mediatype }, instance) {
  const num = await numeroPorInstancia(instance);
  if (!num) return { ok: false, error: "Número WABA não encontrado." };
  if (!(await dentroDaJanela(phone, instance))) return { ok: false, error: "Fora da janela de 24h: só dá para enviar template (texto) a este cliente." };
  const up = await subirMidia(num, { base64, mimetype, fileName });
  if (!up.id) return { ok: false, error: up.error || "Falha ao subir a mídia na Meta." };
  const tipo = mediatype === "image" ? "image" : mediatype === "video" ? "video" : "document";
  const conteudo = { id: up.id };
  if (caption && tipo !== "audio") conteudo.caption = caption;
  if (tipo === "document") conteudo.filename = fileName || "arquivo";
  return enviar(num, { to: destino(phone), type: tipo, [tipo]: conteudo });
}

export async function sendWhatsappAudioWaba(phone, base64, instance) {
  const num = await numeroPorInstancia(instance);
  if (!num) return { ok: false, error: "Número WABA não encontrado." };
  if (!(await dentroDaJanela(phone, instance))) return { ok: false, error: "Fora da janela de 24h: só dá para enviar template (texto) a este cliente." };
  const up = await subirMidia(num, { base64, mimetype: "audio/ogg; codecs=opus", fileName: "audio.ogg" });
  if (!up.id) return { ok: false, error: up.error || "Falha ao subir o áudio na Meta." };
  return enviar(num, { to: destino(phone), type: "audio", audio: { id: up.id } });
}

export async function sendWhatsappContactWaba(phone, { name, contactPhone }, instance) {
  const num = await numeroPorInstancia(instance);
  if (!num) return { ok: false, error: "Número WABA não encontrado." };
  if (!(await dentroDaJanela(phone, instance))) return { ok: false, error: "Fora da janela de 24h." };
  const tel = normalizeBrPhone(contactPhone) || onlyDigits(contactPhone);
  return enviar(num, { to: destino(phone), type: "contacts", contacts: [{ name: { formatted_name: name, first_name: name }, phones: [{ phone: "+" + tel, type: "CELL", wa_id: tel }] }] });
}

// Confirmação de leitura (✓✓ azul pro cliente) — só vale para mensagens recebidas pelo ID da Meta (wamid).
export async function markMessagesAsReadWaba(waMessageIds, instance) {
  const num = await numeroPorInstancia(instance);
  if (!num?.wabaPhoneNumberId || !num?.wabaAccessToken) return;
  for (const id of (waMessageIds || []).slice(-3)) {
    if (!String(id || "").startsWith("wamid")) continue;
    await graph(`${num.wabaPhoneNumberId}/messages`, { method: "POST", token: num.wabaAccessToken, body: { messaging_product: "whatsapp", status: "read", message_id: id } }).catch(() => {});
  }
}

// ---- Estado/conexão ----
const cacheEstado = new Map(); // id -> { em, info }

// Consulta o número na Meta e traduz para o vocabulário do resto do sistema ("open" | "connecting" | "close" | "unknown").
export async function infoNumeroWaba(num, { forcar = false } = {}) {
  if (!num?.wabaPhoneNumberId || !num?.wabaAccessToken) return { state: "close", error: "Falta o Phone Number ID ou o token de acesso." };
  const c = cacheEstado.get(num.id);
  if (!forcar && c && Date.now() - c.em < 45e3) return c.info;
  const r = await graph(num.wabaPhoneNumberId, { token: num.wabaAccessToken, query: { fields: "display_phone_number,verified_name,quality_rating,status,platform_type,code_verification_status,name_status" } });
  let info;
  if (!r.ok) {
    // 190 = token inválido/expirado; erro de rede = não sabemos (não derruba o aviso por engano)
    info = r.status === 401 || r.status === 400 || r.code === 190 ? { state: "close", error: r.error } : { state: "unknown", error: r.error };
  } else {
    const d = r.data || {};
    const conectado = !d.status || String(d.status).toUpperCase() === "CONNECTED";
    info = { state: conectado ? "open" : "close", display: d.display_phone_number, nome: d.verified_name, qualidade: d.quality_rating, status: d.status, plataforma: d.platform_type, raw: d };
  }
  cacheEstado.set(num.id, { em: Date.now(), info });
  return info;
}

export async function stateWaba(num) {
  return (await infoNumeroWaba(num)).state;
}

// ---- Webhook ----
// Valida X-Hub-Signature-256 (HMAC-SHA256 do corpo cru com o App Secret). Sem App Secret configurado, aceita (modo aberto, como os outros webhooks).
export function assinaturaValida(rawBody, header, appSecret) {
  if (!appSecret) return true;
  const esperado = "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const a = Buffer.from(esperado);
  const b = Buffer.from(String(header || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function contatoDeWaba(c) {
  const nome = c?.name?.formatted_name || [c?.name?.first_name, c?.name?.last_name].filter(Boolean).join(" ") || "";
  for (const ph of c?.phones || []) {
    const tel = normalizeBrPhone(ph.wa_id || ph.phone || "");
    if (tel && nome) return { nome: nome.slice(0, 200), telefone: tel };
  }
  return null;
}

// Converte UMA mensagem do webhook (messages[] ou message_echoes[]) no formato de processIncomingMessage.
function mensagemParaSistema(m, { eco, perfis }) {
  const outro = eco ? m.to : m.from;
  const tipo = m.type;
  let text = "";
  let media = null;
  let location = null;
  let contacts = [];
  const midia = (kind, obj, extra = {}) => ({ kind, mimetype: obj?.mime_type || "", caption: obj?.caption || "", fileName: obj?.filename || null, mediaId: obj?.id, ...extra });
  if (tipo === "text") text = m.text?.body || "";
  else if (tipo === "button") text = m.button?.text || m.button?.payload || "";
  else if (tipo === "interactive") text = m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || "";
  else if (tipo === "image") media = midia("image", m.image);
  else if (tipo === "sticker") media = midia("image", m.sticker);
  else if (tipo === "audio") media = midia("audio", m.audio);
  else if (tipo === "video") media = midia("document", m.video);
  else if (tipo === "document") media = midia("document", m.document);
  else if (tipo === "location" && m.location) {
    location = { url: `https://www.google.com/maps?q=${m.location.latitude},${m.location.longitude}`, label: [m.location.name, m.location.address].filter(Boolean).join(" — ") };
  } else if (tipo === "contacts") {
    contacts = (m.contacts || []).map(contatoDeWaba).filter(Boolean);
    if (!contacts.length) text = "📇 Contato enviado (não consegui ler o telefone)";
  } else if (tipo === "reaction" || tipo === "unsupported" || tipo === "system" || tipo === "request_welcome") return null;
  else text = "[mensagem de tipo não suportado: " + tipo + "]";
  return {
    fromMe: !!eco,
    isGroup: false,
    number: onlyDigits(outro),
    numeroEhLid: false,
    pushName: perfis?.[onlyDigits(outro)] || "",
    text,
    media,
    location,
    contacts,
    waMessageId: m.id || null,
    timestamp: m.timestamp ? Number(m.timestamp) * 1000 : null,
  };
}

// Percorre o corpo do webhook e devolve { mensagens: [{ phoneNumberId, ...mensagem }], statuses: [{ id, status }], ignorados }.
export function interpretarWebhookWaba(body) {
  const mensagens = [];
  const statuses = [];
  const outros = [];
  for (const entry of body?.entry || []) {
    for (const ch of entry?.changes || []) {
      const v = ch?.value || {};
      const phoneNumberId = v.metadata?.phone_number_id || null;
      const perfis = {};
      for (const c of v.contacts || []) perfis[onlyDigits(c.wa_id)] = c.profile?.name || "";
      if (ch.field === "messages") {
        for (const m of v.messages || []) {
          const x = mensagemParaSistema(m, { eco: false, perfis });
          if (x) mensagens.push({ phoneNumberId, ...x });
        }
        for (const s of v.statuses || []) statuses.push({ phoneNumberId, id: s.id, status: s.status, erro: s.errors?.[0]?.title || null });
      } else if (ch.field === "smb_message_echoes") {
        // Coexistência: mensagem enviada pelo app WhatsApp Business do celular (ou por outra API).
        for (const m of v.message_echoes || []) {
          const x = mensagemParaSistema(m, { eco: true, perfis });
          if (x) mensagens.push({ phoneNumberId, ...x });
        }
      } else {
        // history (histórico antigo), smb_app_state_sync (contatos), account_update, phone_number_quality_update...
        outros.push({ field: ch.field, phoneNumberId, value: v });
      }
    }
  }
  return { mensagens, statuses, outros };
}

// ACK da Meta -> vocabulário de lib/webhookCommon.js (entregue | lido).
export function statusParaSistema(s) {
  if (s === "delivered") return "entregue";
  if (s === "read") return "lido";
  return null;
}

// Baixa a mídia recebida: 1) GET /{media-id} devolve a URL temporária; 2) baixa a URL com o mesmo token.
export async function baixarMidiaWaba(mediaId, token) {
  if (!mediaId || !token) return null;
  const meta = await graph(mediaId, { token });
  if (!meta.ok || !meta.data?.url) return null;
  try {
    const res = await fetchComTimeout(meta.data.url, { headers: { Authorization: `Bearer ${token}` } }, 60000);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return { base64: buf.toString("base64"), mimetype: res.headers.get("content-type") || meta.data.mime_type || undefined };
  } catch {
    return null;
  }
}

// ---- Cadastro Integrado (Embedded Signup) / coexistência ----
// O front abre o fluxo da Meta (FB.login com config_id) e devolve o `code` + phone_number_id + waba_id.
// Aqui trocamos o code pelo token de negócio, inscrevemos o app na conta (para receber o webhook) e guardamos tudo no número.
export async function finalizarCadastroIntegrado({ numeroId, code, phoneNumberId, wabaId, coexistencia }) {
  const cfg = await getWabaConfig();
  if (!cfg.appId || !cfg.appSecret) return { ok: false, error: "Preencha o App ID e o App Secret da Meta em Configurações → Números → WABA." };
  const troca = await graph("oauth/access_token", { query: { client_id: cfg.appId, client_secret: cfg.appSecret, code } });
  const token = troca.ok ? troca.data?.access_token : null;
  if (!token) return { ok: false, error: troca.error || "A Meta não devolveu o token de acesso." };
  if (wabaId) {
    const sub = await graph(`${wabaId}/subscribed_apps`, { method: "POST", token });
    if (!sub.ok) return { ok: false, error: "Token obtido, mas falhou ao inscrever o app na conta: " + sub.error };
  }
  await prisma.whatsappNumber.update({
    where: { id: numeroId },
    data: { wabaAccessToken: token, wabaPhoneNumberId: phoneNumberId || undefined, wabaBusinessAccountId: wabaId || undefined, wabaCoexistence: !!coexistencia, provider: "waba" },
  });
  return { ok: true };
}

// Para o botão "Testar" do app (credenciais do app válidas?).
export async function testarAppWaba() {
  const cfg = await getWabaConfig();
  if (!cfg.appId || !cfg.appSecret) return { ok: false, error: "Preencha o App ID e o App Secret." };
  const r = await graph("oauth/access_token", { query: { client_id: cfg.appId, client_secret: cfg.appSecret, grant_type: "client_credentials" } });
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}
