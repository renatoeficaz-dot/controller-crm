import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import {
  extractIncomingText,
  detectIncomingMedia,
  fetchIncomingMediaBase64,
  onlyDigits,
} from "@/lib/evolution";

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
  if (data.key?.fromMe) return NextResponse.json({ ok: true }); // ignora o eco das nossas mensagens

  const remoteJid = data.key?.remoteJid || "";
  if (remoteJid.endsWith("@g.us")) return NextResponse.json({ ok: true }); // ignora grupos
  const number = onlyDigits(remoteJid.split("@")[0]);
  if (!number) return NextResponse.json({ ok: true });

  const text = extractIncomingText(data.message);
  const media = detectIncomingMedia(data.message); // áudio / imagem / documento / vídeo
  if (!text && !media) return NextResponse.json({ ok: true }); // nada que saibamos exibir

  // Acha o contato pelo telefone (últimos 8 dígitos batem, pra tolerar formatações)
  const tail = number.slice(-8);
  let contact = await prisma.contact.findFirst({
    where: { phone: { endsWith: tail } },
  });

  // Se não existir, cria um lead novo na primeira coluna
  if (!contact) {
    const first = await prisma.stage.findFirst({ orderBy: { order: "asc" } });
    if (!first) return NextResponse.json({ ok: true });
    contact = await prisma.contact.create({
      data: {
        name: data.pushName || number,
        phone: number,
        stageId: first.id,
      },
    });
  }

  // Monta a mensagem (texto ou mídia)
  const msg = { contactId: contact.id, fromMe: false, status: "recebido" };
  if (media) {
    const file = await fetchIncomingMediaBase64(instance, data.key);
    if (file?.base64) {
      const mime = file.mimetype || media.mimetype;
      msg.kind = media.kind;
      msg.body = media.caption || "";
      msg.mediaUrl = `data:${mime};base64,${file.base64}`;
      msg.mimeType = mime;
      msg.fileName = file.fileName || media.fileName || null;
    } else {
      // Não conseguiu baixar o arquivo: registra um aviso pra não perder a mensagem
      msg.kind = "text";
      msg.body = media.caption || `[${media.kind} recebido — não foi possível baixar o arquivo]`;
    }
  } else {
    msg.kind = "text";
    msg.body = text;
  }

  await prisma.message.create({ data: msg });
  return NextResponse.json({ ok: true });
}
