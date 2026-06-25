// Cliente da Evolution API (WhatsApp).
// Configure no .env: EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE

export function evolutionConfigured() {
  return Boolean(
    process.env.EVOLUTION_API_URL &&
      process.env.EVOLUTION_API_KEY &&
      process.env.EVOLUTION_INSTANCE
  );
}

// Mantém só os dígitos: +55 (11) 99999-9999 -> 5511999999999
export function onlyDigits(phone) {
  return (phone || "").replace(/\D/g, "");
}

// Envia uma mensagem de texto pelo WhatsApp.
// Retorna { ok, simulated, data, error }
export async function sendWhatsappText(phone, text) {
  const number = onlyDigits(phone);
  if (!number) return { ok: false, error: "Contato sem telefone." };

  // Sem credenciais => modo simulado (a mensagem é salva mas não sai de verdade)
  if (!evolutionConfigured()) {
    return { ok: true, simulated: true };
  }

  const base = process.env.EVOLUTION_API_URL.replace(/\/$/, "");
  const instance = process.env.EVOLUTION_INSTANCE;
  const apikey = process.env.EVOLUTION_API_KEY;

  try {
    const res = await fetch(`${base}/message/sendText/${instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey },
      body: JSON.stringify({ number, text }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data?.message || `Evolution respondeu ${res.status}`, data };
    }
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Envia mídia (imagem / documento) pelo WhatsApp.
// mediatype: "image" | "video" | "document"
export async function sendWhatsappMedia(phone, { base64, mimetype, fileName, caption, mediatype }) {
  const number = onlyDigits(phone);
  if (!number) return { ok: false, error: "Contato sem telefone." };
  if (!evolutionConfigured()) return { ok: true, simulated: true };

  const base = process.env.EVOLUTION_API_URL.replace(/\/$/, "");
  const instance = process.env.EVOLUTION_INSTANCE;
  const apikey = process.env.EVOLUTION_API_KEY;
  try {
    const res = await fetch(`${base}/message/sendMedia/${instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey },
      body: JSON.stringify({ number, mediatype, mimetype, media: base64, fileName, caption }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.message || `Evolution respondeu ${res.status}`, data };
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Envia áudio de voz (PTT) pelo WhatsApp.
export async function sendWhatsappAudio(phone, base64) {
  const number = onlyDigits(phone);
  if (!number) return { ok: false, error: "Contato sem telefone." };
  if (!evolutionConfigured()) return { ok: true, simulated: true };

  const base = process.env.EVOLUTION_API_URL.replace(/\/$/, "");
  const instance = process.env.EVOLUTION_INSTANCE;
  const apikey = process.env.EVOLUTION_API_KEY;
  try {
    const res = await fetch(`${base}/message/sendWhatsAppAudio/${instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey },
      body: JSON.stringify({ number, audio: base64 }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.message || `Evolution respondeu ${res.status}`, data };
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Cria/conecta uma instância e devolve o QR Code (base64) para parear no WhatsApp.
export async function connectInstance(base, apikey, instanceName) {
  if (!base || !apikey) return { error: "Configure a URL e a API Key da Evolution." };
  base = base.replace(/\/$/, "");
  const headers = { "Content-Type": "application/json", apikey };

  try {
    // 1) tenta criar a instância já pedindo o QR
    let res = await fetch(`${base}/instance/create`, {
      method: "POST",
      headers,
      body: JSON.stringify({ instanceName, qrcode: true, integration: "WHATSAPP-BAILEYS" }),
    });
    let data = await res.json().catch(() => ({}));
    if (res.ok) {
      const qr = data?.qrcode?.base64 || data?.base64;
      if (qr) return { qr, code: data?.qrcode?.code || data?.code };
    }

    // 2) já existe -> pega o QR pelo connect
    res = await fetch(`${base}/instance/connect/${instanceName}`, { method: "GET", headers });
    data = await res.json().catch(() => ({}));
    if (res.ok) {
      const qr = data?.base64 || data?.qrcode?.base64;
      if (qr) return { qr, code: data?.code || data?.pairingCode };
      return { connected: true, raw: data }; // sem QR normalmente = já conectado
    }
    return { error: data?.message || data?.error || `Evolution respondeu ${res.status}` };
  } catch (err) {
    return { error: err.message };
  }
}

// Estado da conexão: "open" (conectado) | "connecting" | "close"
export async function instanceState(base, apikey, instanceName) {
  if (!base || !apikey) return "unknown";
  base = base.replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/instance/connectionState/${instanceName}`, {
      headers: { apikey },
    });
    const data = await res.json().catch(() => ({}));
    return data?.instance?.state || data?.state || "unknown";
  } catch {
    return "unknown";
  }
}

// Extrai o texto de um payload de mensagem recebida (messages.upsert da Evolution)
export function extractIncomingText(message) {
  if (!message) return "";
  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    ""
  );
}
