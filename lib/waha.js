// Cliente da API do WAHA (WhatsApp HTTP API — https://waha.devlike.pro), motor
// WEBJS: automatiza um Chromium real na página do WhatsApp Web, então se
// comporta como "usar pelo navegador" — risco de bloqueio menor que clientes
// que reimplementam o protocolo direto.
// Cada número WhatsappNumber com provider="waha" usa o campo `instance` como
// nome da SESSÃO no WAHA (equivalente à "instância" da Evolution).
import { prisma } from "@/lib/prisma";
import { onlyDigits, normalizeBrPhone } from "@/lib/evolution";

async function getWahaCreds() {
  const cfg = await prisma.config.findUnique({ where: { id: "singleton" } }).catch(() => null);
  const base = (cfg?.wahaUrl || "").replace(/\/$/, "");
  const apikey = cfg?.wahaApiKey || "";
  return { base, apikey, ok: Boolean(base && apikey) };
}

function chatId(phone) {
  return `${onlyDigits(phone)}@c.us`;
}

// Cria (se não existir) e inicia uma sessão, configurando o webhook. Idempotente:
// se a sessão já existe, o WAHA responde com o estado atual dela.
export async function connectSessionWaha(base, apikey, session, webhookUrl) {
  if (!base || !apikey) return { error: "Configure a URL e a API Key do WAHA." };
  base = base.replace(/\/$/, "");
  const headers = { "Content-Type": "application/json", "X-Api-Key": apikey };
  try {
    const body = {
      name: session,
      start: true,
      config: webhookUrl ? { webhooks: [{ url: webhookUrl, events: ["message"] }] } : undefined,
    };
    let res = await fetch(`${base}/api/sessions`, { method: "POST", headers, body: JSON.stringify(body) });
    let data = await res.json().catch(() => ({}));
    // Sessão já existe (409) — só garante que está iniciada.
    if (res.status === 409) {
      res = await fetch(`${base}/api/sessions/${session}/start`, { method: "POST", headers });
      data = await res.json().catch(() => ({}));
    }
    if (!res.ok && res.status !== 409) {
      return { error: data?.message || data?.error || `WAHA respondeu ${res.status}` };
    }
    if (data.status === "WORKING") return { connected: true, raw: data };
    // QR ainda não pronto (STARTING) — o front deve pedir o QR em seguida (poll).
    return { pending: true, status: data.status };
  } catch (err) {
    return { error: err.message };
  }
}

// Busca o QR code (converte a imagem PNG em base64 pra exibir direto no front).
export async function fetchQrWaha(base, apikey, session) {
  base = base.replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/api/${session}/auth/qr?format=image`, {
      headers: { "X-Api-Key": apikey },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

// Desconecta (logout) — a sessão continua cadastrada no WAHA, só encerra o pareamento.
export async function disconnectSessionWaha(base, apikey, session) {
  if (!base || !apikey || !session) return { ok: false, error: "Parâmetros incompletos." };
  base = base.replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/api/sessions/${session}/logout`, {
      method: "POST",
      headers: { "X-Api-Key": apikey },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.message || data?.error || `WAHA respondeu ${res.status}`, data };
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Estado da sessão, traduzido pro mesmo vocabulário usado pra Evolution
// ("open" | "connecting" | "close") — o resto do sistema não precisa saber
// qual provedor está por trás.
export async function sessionStateWaha(base, apikey, session) {
  if (!base || !apikey) return "unknown";
  base = base.replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/api/sessions/${session}`, { headers: { "X-Api-Key": apikey } });
    const data = await res.json().catch(() => ({}));
    if (data.status === "WORKING") return "open";
    if (data.status === "SCAN_QR_CODE" || data.status === "STARTING") return "connecting";
    return "close";
  } catch {
    return "unknown";
  }
}

export async function testWahaConnection(base, apikey) {
  if (!base || !apikey) return { ok: false, error: "Preencha a URL e a API Key." };
  base = base.replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/api/server/version`, { headers: { "X-Api-Key": apikey } });
    if (res.status === 401 || res.status === 403) return { ok: false, error: "API Key inválida." };
    if (!res.ok) return { ok: false, error: `Servidor respondeu ${res.status}.` };
    const data = await res.json().catch(() => null);
    return { ok: true, engine: data?.engine, version: data?.version };
  } catch (err) {
    return { ok: false, error: "Não foi possível conectar: " + err.message };
  }
}

export async function sendWhatsappTextWaha(phone, text, session) {
  const { base, apikey, ok } = await getWahaCreds();
  if (!ok || !session) return { ok: true, simulated: true };
  try {
    const res = await fetch(`${base}/api/sendText`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": apikey },
      body: JSON.stringify({ session, chatId: chatId(phone), text }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error || data?.message || `WAHA respondeu ${res.status}`, data };
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function sendWhatsappMediaWaha(phone, { base64, mimetype, fileName, caption, mediatype }, session) {
  const { base, apikey, ok } = await getWahaCreds();
  if (!ok || !session) return { ok: true, simulated: true };
  const endpoint = mediatype === "image" ? "sendImage" : "sendFile";
  try {
    const res = await fetch(`${base}/api/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": apikey },
      body: JSON.stringify({
        session,
        chatId: chatId(phone),
        file: { mimetype, filename: fileName || "arquivo", data: base64 },
        caption,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error || data?.message || `WAHA respondeu ${res.status}`, data };
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function sendWhatsappAudioWaha(phone, base64, session) {
  const { base, apikey, ok } = await getWahaCreds();
  if (!ok || !session) return { ok: true, simulated: true };
  try {
    const res = await fetch(`${base}/api/sendVoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": apikey },
      body: JSON.stringify({ session, chatId: chatId(phone), file: { mimetype: "audio/ogg; codecs=opus", filename: "audio.ogg", data: base64 } }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error || data?.message || `WAHA respondeu ${res.status}`, data };
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function sendWhatsappContactWaha(phone, { name, contactPhone }, session) {
  const { base, apikey, ok } = await getWahaCreds();
  if (!ok || !session) return { ok: true, simulated: true };
  const cNumber = normalizeBrPhone(contactPhone) || onlyDigits(contactPhone);
  const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${name}\nTEL;type=CELL:+${cNumber}\nEND:VCARD`;
  try {
    const res = await fetch(`${base}/api/sendContactVcard`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": apikey },
      body: JSON.stringify({ session, chatId: chatId(phone), contacts: [{ vcard }] }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error || data?.message || `WAHA respondeu ${res.status}`, data };
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Normaliza um payload de webhook do WAHA (evento "message") pro mesmo
// formato que o resto do sistema já entende (texto/mídia/localização).
export function extractIncomingFromWaha(payload) {
  const p = payload?.payload || {};
  const fromMe = Boolean(p.fromMe);
  const remoteJid = p.from || "";
  const isGroup = remoteJid.endsWith("@g.us");
  const number = onlyDigits(remoteJid.split("@")[0]);
  const text = p.body || "";
  let media = null;
  if (p.hasMedia && p.media) {
    const mt = p.media.mimetype || "";
    const kind = mt.startsWith("audio/") ? "audio" : mt.startsWith("image/") ? "image" : "document";
    media = { kind, mimetype: mt, caption: p.caption || "", fileName: p.media.filename || null, url: p.media.url };
  }
  let location = null;
  if (p.location) {
    location = {
      url: `https://www.google.com/maps?q=${p.location.latitude},${p.location.longitude}`,
      label: p.location.description || "",
    };
  }
  return { fromMe, isGroup, number, pushName: p._data?.notifyName || p.notifyName || "", text, media, location, mediaKey: p.id };
}

// Baixa o conteúdo de uma mídia recebida — o webhook já traz a URL pronta.
export async function fetchIncomingMediaBase64Waha(url, apikey) {
  if (!url) return null;
  try {
    const res = await fetch(url, { headers: apikey ? { "X-Api-Key": apikey } : {} });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return { base64: buf.toString("base64"), mimetype: res.headers.get("content-type") || undefined };
  } catch {
    return null;
  }
}
