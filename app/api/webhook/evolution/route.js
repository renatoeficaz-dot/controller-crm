import { NextResponse } from "next/server";
import {
  extractIncomingText,
  detectIncomingMedia,
  extractIncomingLocation,
  fetchIncomingMediaBase64,
  onlyDigits,
} from "@/lib/evolution";
import { processIncomingMessage } from "@/lib/webhookCommon";

// Webhook da Evolution API: recebe mensagens que o cliente manda no WhatsApp.
// Configure na Evolution para apontar para:  <seu-dominio>/api/webhook/evolution
export async function POST(req) {
  const payload = await req.json().catch(() => null);
  if (!payload) return NextResponse.json({ ok: true });

  // Evolution v2 manda { event, instance, data: { key, message, pushName } }
  const event = payload.event || "";
  if (!event.includes("messages")) return NextResponse.json({ ok: true });

  const instance = payload.instance || "";
  const data = payload.data || {};
  const fromMe = Boolean(data.key?.fromMe);
  const remoteJid = data.key?.remoteJid || "";
  const number = onlyDigits(remoteJid.split("@")[0]);

  const media = detectIncomingMedia(data.message);

  await processIncomingMessage({
    instance,
    fromMe,
    isGroup: remoteJid.endsWith("@g.us"),
    number,
    pushName: data.pushName,
    text: extractIncomingText(data.message),
    media,
    location: extractIncomingLocation(data.message),
    downloadMedia: media ? () => fetchIncomingMediaBase64(instance, data.key) : null,
  });

  return NextResponse.json({ ok: true });
}
