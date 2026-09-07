import { NextResponse } from "next/server";
import {
  extractIncomingText,
  detectIncomingMedia,
  extractIncomingLocation,
  extractIncomingContacts,
  fetchIncomingMediaBase64,
  onlyDigits,
  telefoneDeJid,
  apenasLid,
} from "@/lib/evolution";
import { processIncomingMessage } from "@/lib/webhookCommon";
import { webhookAutorizado } from "@/lib/webhookAuth";

// Webhook da Evolution API: recebe mensagens que o cliente manda no WhatsApp.
// Configure na Evolution para apontar para:  <seu-dominio>/api/webhook/evolution
export async function POST(req) {
  // Só barra se um token estiver configurado — ver lib/webhookAuth.js.
  if (!(await webhookAutorizado(req))) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }
  const payload = await req.json().catch(() => null);
  if (!payload) return NextResponse.json({ ok: true });

  // Evolution v2 manda { event, instance, data: { key, message, pushName } }
  const event = payload.event || "";
  if (!event.includes("messages")) return NextResponse.json({ ok: true });

  const instance = payload.instance || "";
  const data = payload.data || {};
  const fromMe = Boolean(data.key?.fromMe);
  const remoteJid = data.key?.remoteJid || "";
  // Quando NENHUM candidato tem telefone real (só @lid — recurso de
  // privacidade do WhatsApp que esconde o número de quem manda), telefoneDeJid
  // não devolve null: usa os dígitos do próprio @lid como "número", porque
  // descartar a mensagem faria perder o lead de vez. Só que esse "número" não
  // é discável — nunca vai ser possível responder por ele. numeroEhLid avisa
  // processIncomingMessage disso pra tratar o lead de forma diferente (ver lá).
  const lidCandidatos = [
    data.key?.remoteJidAlt, data.key?.senderPn, data.key?.participantPn,
    data.key?.participantAlt, data.key?.participant,
  ];
  const number = telefoneDeJid(remoteJid, lidCandidatos);
  const numeroEhLid = apenasLid(remoteJid, lidCandidatos);

  const media = detectIncomingMedia(data.message);

  await processIncomingMessage({
    instance,
    fromMe,
    isGroup: remoteJid.endsWith("@g.us"),
    number,
    numeroEhLid,
    pushName: data.pushName,
    text: extractIncomingText(data.message),
    media,
    location: extractIncomingLocation(data.message),
    contacts: extractIncomingContacts(data.message),
    downloadMedia: media ? () => fetchIncomingMediaBase64(instance, data.key) : null,
    waMessageId: data.key?.id || null,
  });

  return NextResponse.json({ ok: true });
}
