// Cliente da Evolution API (WhatsApp).
// As credenciais (URL + API Key) vêm da tela Configurações → Números (banco);
// a instância usada para ENVIAR é a do primeiro número conectado.
// Fallback opcional por variáveis de ambiente: EVOLUTION_API_URL / _API_KEY / _INSTANCE.
import { prisma } from "@/lib/prisma";

// Resolve as credenciais de envio: URL + API Key do banco (config) e a instância
// a usar. Se `instance` for passado (ex.: a instância da conversa), usa ele direto;
// senão cai pro primeiro número conectado (comportamento antigo, só como último recurso).
async function getEvolutionCreds(instance) {
  const cfg = await prisma.config
    .findUnique({ where: { id: "singleton" } })
    .catch(() => null);
  const base = (cfg?.evolutionUrl || process.env.EVOLUTION_API_URL || "").replace(/\/$/, "");
  const apikey = cfg?.evolutionApiKey || process.env.EVOLUTION_API_KEY || "";
  if (!instance) {
    const first = await prisma.whatsappNumber
      .findFirst({ orderBy: { createdAt: "asc" } })
      .catch(() => null);
    instance = first?.instance || process.env.EVOLUTION_INSTANCE || "";
  }
  return { base, apikey, instance, ok: Boolean(base && apikey && instance) };
}

// Mostra "digitando…" pro contato no WhatsApp — usado enquanto a IA processa
// uma resposta demorada, pra o cliente não achar que travou.
export async function sendPresence(phone, instanceHint, presence = "composing") {
  const number = onlyDigits(phone);
  if (!number) return;
  const { base, apikey, instance, ok } = await getEvolutionCreds(instanceHint);
  if (!ok) return;
  try {
    await fetch(`${base}/chat/sendPresence/${instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey },
      body: JSON.stringify({ number, presence, delay: 20000 }),
    });
  } catch {
    // best-effort — não bloqueia o fluxo se a Evolution não suportar/falhar
  }
}

// Descobre por qual instância (número) a conversa com esse contato está rolando,
// olhando a mensagem mais recente com instância registrada (enviada ou recebida).
// null = não achou (cai pro fallback do primeiro número conectado).
export async function resolveInstanceForContact(contactId) {
  const last = await prisma.message.findFirst({
    where: { contactId, instance: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { instance: true },
  });
  return last?.instance || null;
}

// Indica se o envio está configurado (URL + API Key + uma instância conectada).
export async function evolutionConfigured() {
  return (await getEvolutionCreds()).ok;
}

// Mantém só os dígitos: +55 (11) 99999-9999 -> 5511999999999
export function onlyDigits(phone) {
  return (phone || "").replace(/\D/g, "");
}

// Envia uma mensagem de texto pelo WhatsApp.
// `instance` (opcional): força o número de envio (ex.: o mesmo que recebeu a
// conversa) — sem isso, cai no primeiro número conectado.
// Retorna { ok, simulated, data, error }
export async function sendWhatsappText(phone, text, instanceHint) {
  const number = onlyDigits(phone);
  if (!number) return { ok: false, error: "Contato sem telefone." };

  const { base, apikey, instance, ok } = await getEvolutionCreds(instanceHint);
  // Sem credenciais/instância => modo simulado (a mensagem é salva mas não sai).
  if (!ok) return { ok: true, simulated: true };

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
export async function sendWhatsappMedia(phone, { base64, mimetype, fileName, caption, mediatype }, instanceHint) {
  const number = onlyDigits(phone);
  if (!number) return { ok: false, error: "Contato sem telefone." };

  const { base, apikey, instance, ok } = await getEvolutionCreds(instanceHint);
  if (!ok) return { ok: true, simulated: true };
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
export async function sendWhatsappAudio(phone, base64, instanceHint) {
  const number = onlyDigits(phone);
  if (!number) return { ok: false, error: "Contato sem telefone." };

  const { base, apikey, instance, ok } = await getEvolutionCreds(instanceHint);
  if (!ok) return { ok: true, simulated: true };
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

// Desconecta (logout) a instância do WhatsApp — a instância continua cadastrada
// na Evolution (pode reconectar depois via QR), só encerra a sessão do aparelho.
export async function disconnectInstance(base, apikey, instanceName) {
  if (!base || !apikey || !instanceName) return { ok: false, error: "Parâmetros incompletos." };
  base = base.replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/instance/logout/${instanceName}`, {
      method: "DELETE",
      headers: { apikey },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.message || `Evolution respondeu ${res.status}`, data };
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Configura o webhook da instância para entregar as mensagens recebidas no nosso app.
// webhookUrl deve apontar para <app>/api/webhook/evolution (evento messages.upsert).
export async function setWebhook(base, apikey, instanceName, webhookUrl) {
  if (!base || !apikey || !instanceName || !webhookUrl) {
    return { ok: false, error: "Parâmetros do webhook incompletos." };
  }
  base = base.replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/webhook/set/${instanceName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey },
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: webhookUrl,
          webhookByEvents: false,
          webhookBase64: false,
          events: ["MESSAGES_UPSERT"],
        },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.message || `Evolution respondeu ${res.status}`, data };
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
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

// Envia um contato (vCard) pelo WhatsApp.
export async function sendWhatsappContact(phone, { name, contactPhone }, instanceHint) {
  const number = onlyDigits(phone);
  if (!number) return { ok: false, error: "Contato sem telefone." };

  const { base, apikey, instance, ok } = await getEvolutionCreds(instanceHint);
  if (!ok) return { ok: true, simulated: true };

  const contactNumber = onlyDigits(contactPhone);
  try {
    const res = await fetch(`${base}/message/sendContact/${instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey },
      body: JSON.stringify({
        number,
        contact: [{ fullName: name, wuid: contactNumber + "@s.whatsapp.net", phoneNumber: contactPhone }],
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.message || `Evolution respondeu ${res.status}`, data };
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Extrai o texto de um payload de mensagem recebida (messages.upsert da Evolution)
export function extractIncomingText(message) {
  if (!message) return "";
  return message.conversation || message.extendedTextMessage?.text || "";
}

// Detecta mídia recebida e mapeia para o "kind" usado no CRM (audio | image | document).
// Retorna { kind, mimetype, caption, fileName } ou null se não for mídia.
export function detectIncomingMedia(message) {
  if (!message) return null;
  if (message.audioMessage)
    return { kind: "audio", mimetype: message.audioMessage.mimetype || "audio/ogg", caption: "" };
  if (message.imageMessage)
    return { kind: "image", mimetype: message.imageMessage.mimetype || "image/jpeg", caption: message.imageMessage.caption || "" };
  if (message.stickerMessage)
    return { kind: "image", mimetype: message.stickerMessage.mimetype || "image/webp", caption: "" };
  if (message.videoMessage)
    return { kind: "document", mimetype: message.videoMessage.mimetype || "video/mp4", caption: message.videoMessage.caption || "" };
  if (message.documentMessage)
    return { kind: "document", mimetype: message.documentMessage.mimetype || "application/octet-stream", caption: message.documentMessage.caption || "", fileName: message.documentMessage.fileName };
  // Algumas versões embrulham o documento com legenda
  const dm = message.documentWithCaptionMessage?.message?.documentMessage;
  if (dm)
    return { kind: "document", mimetype: dm.mimetype || "application/octet-stream", caption: dm.caption || "", fileName: dm.fileName };
  return null;
}

// Localização (📍) não é um "arquivo" pra baixar — vem com lat/long direto no payload.
// Retorna { url, label } com um link do Google Maps, ou null se não for localização.
export function extractIncomingLocation(message) {
  const loc = message?.locationMessage || message?.liveLocationMessage;
  if (!loc || loc.degreesLatitude == null || loc.degreesLongitude == null) return null;
  const { degreesLatitude: lat, degreesLongitude: lng, name, address } = loc;
  const label = [name, address].filter(Boolean).join(" — ");
  return { url: `https://www.google.com/maps?q=${lat},${lng}`, label };
}

// Baixa o conteúdo (base64) de uma mídia recebida, usando a config do banco.
// Retorna { base64, mimetype, fileName } ou null se não conseguir.
export async function fetchIncomingMediaBase64(instance, key) {
  const cfg = await prisma.config.findUnique({ where: { id: "singleton" } }).catch(() => null);
  const base = (cfg?.evolutionUrl || process.env.EVOLUTION_API_URL || "").replace(/\/$/, "");
  const apikey = cfg?.evolutionApiKey || process.env.EVOLUTION_API_KEY || "";
  if (!base || !apikey || !instance || !key) return null;
  try {
    const res = await fetch(`${base}/chat/getBase64FromMediaMessage/${instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey },
      body: JSON.stringify({ message: { key }, convertToMp4: false }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.base64) return null;
    return { base64: data.base64, mimetype: data.mimetype, fileName: data.fileName };
  } catch {
    return null;
  }
}
