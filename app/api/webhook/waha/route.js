import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { extractIncomingFromWaha, fetchIncomingMediaBase64Waha } from "@/lib/waha";
import { processIncomingMessage } from "@/lib/webhookCommon";

// Webhook do WAHA: recebe mensagens que o cliente manda no WhatsApp.
// Configurado automaticamente ao conectar um número com provider="waha"
// (aponta pra <seu-dominio>/api/webhook/waha).
export async function POST(req) {
  const payload = await req.json().catch(() => null);
  if (!payload || payload.event !== "message") return NextResponse.json({ ok: true });

  const instance = payload.session || "";
  const { fromMe, isGroup, number, pushName, text, media, location } = extractIncomingFromWaha(payload);

  let mediaUrl = payload?.payload?.media?.url || null;
  const cfg = media && mediaUrl ? await prisma.config.findUnique({ where: { id: "singleton" } }) : null;

  await processIncomingMessage({
    instance,
    fromMe,
    isGroup,
    number,
    pushName,
    text,
    media,
    location,
    downloadMedia: media && mediaUrl ? () => fetchIncomingMediaBase64Waha(mediaUrl, cfg?.wahaApiKey) : null,
  });

  return NextResponse.json({ ok: true });
}
