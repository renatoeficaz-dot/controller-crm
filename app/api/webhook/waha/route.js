import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { extractIncomingFromWaha, fetchIncomingMediaBase64Waha, extractAckWaha, resolveLidPhoneWaha } from "@/lib/waha";
import { processIncomingMessage, processMessageAck } from "@/lib/webhookCommon";
import { webhookAutorizado } from "@/lib/webhookAuth";

// Webhook do WAHA: recebe mensagens que o cliente manda no WhatsApp, e as
// confirmações de entrega/leitura (✓✓) das que a gente manda.
// Configurado automaticamente ao conectar um número com provider="waha"
// (aponta pra <seu-dominio>/api/webhook/waha).
export async function POST(req) {
  // Só barra se um token estiver configurado — ver lib/webhookAuth.js.
  if (!(await webhookAutorizado(req))) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }
  const payload = await req.json().catch(() => null);
  if (!payload) return NextResponse.json({ ok: true });

  if (payload.event === "message.ack") {
    const { waMessageId, status } = extractAckWaha(payload);
    if (status) await processMessageAck(waMessageId, status);
    return NextResponse.json({ ok: true });
  }
  if (payload.event !== "message") return NextResponse.json({ ok: true });

  const instance = payload.session || "";
  let { fromMe, isGroup, number, numeroEhLid, lidJid, pushName, text, media, location, contacts, mediaKey } = extractIncomingFromWaha(payload);

  // Número oculto (@lid) — a maioria dos clientes hoje em dia: antes de cair
  // no fallback de usar os dígitos do @lid como "número" (não discável, IA
  // nunca responde, e sem isso mensagens de gente diferente colidiam entre
  // si), tenta resolver o telefone de verdade consultando o WAHA — ver
  // resolveLidPhoneWaha em lib/waha.js.
  if (numeroEhLid && lidJid) {
    const real = await resolveLidPhoneWaha(instance, lidJid);
    if (real) {
      number = real;
      numeroEhLid = false;
    }
  }

  let mediaUrl = payload?.payload?.media?.url || null;
  const cfg = media && mediaUrl ? await prisma.config.findUnique({ where: { id: "singleton" } }) : null;

  await processIncomingMessage({
    instance,
    fromMe,
    isGroup,
    number,
    numeroEhLid,
    pushName,
    text,
    media,
    location,
    contacts,
    downloadMedia: media && mediaUrl ? () => fetchIncomingMediaBase64Waha(mediaUrl, cfg?.wahaApiKey) : null,
    waMessageId: mediaKey || null,
  });

  return NextResponse.json({ ok: true });
}
