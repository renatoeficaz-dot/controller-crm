import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { sendWhatsappText, sendWhatsappMedia, sendWhatsappAudio, sendWhatsappContact } from "@/lib/evolution";
import { getCurrentUser, mensagensWhere } from "@/lib/session";

// Lista mensagens do contato (conforme os WhatsApp que o usuário pode ver).
// Não traz o campo mediaUrl (base64) — mídia é carregada sob demanda via
// /api/messages/[id]/media, pra não pesar o payload em conversas com áudio/imagem.
export async function GET(_req, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const extra = mensagensWhere(user);
  const messages = await prisma.message.findMany({
    where: { contactId: id, ...(extra || {}) },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      contactId: true,
      body: true,
      kind: true,
      mimeType: true,
      fileName: true,
      fromMe: true,
      status: true,
      instance: true,
      readAt: true,
      createdAt: true,
    },
  });
  return NextResponse.json(messages);
}

// Envia mensagem pelo WhatsApp (Evolution API) e salva no histórico
// Aceita:
//   { body } — texto simples
//   { mediaType: "image"|"audio"|"document", mediaBase64, mediaMimetype, mediaFileName, body } — mídia
//   { mediaType: "contact", contactName, contactPhone } — contato vCard
export async function POST(req, { params }) {
  const { id } = await params;
  const payload = await req.json();
  const { mediaType, mediaBase64, mediaMimetype, mediaFileName, contactName, contactPhone } = payload;
  const body = payload.body || "";

  const contact = await prisma.contact.findUnique({ where: { id } });
  if (!contact) return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 });

  let result;
  let kind = "text";
  let mimeType = null;
  let fileName = null;

  if (mediaType === "contact") {
    if (!contactName || !contactPhone) {
      return NextResponse.json({ error: "Nome e telefone do contato são obrigatórios." }, { status: 400 });
    }
    result = await sendWhatsappContact(contact.phone, { name: contactName, contactPhone });
    kind = "document";
  } else if (mediaType === "audio") {
    if (!mediaBase64) return NextResponse.json({ error: "Arquivo ausente." }, { status: 400 });
    result = await sendWhatsappAudio(contact.phone, mediaBase64);
    kind = "audio";
    mimeType = mediaMimetype || "audio/ogg";
  } else if (mediaType === "image" || mediaType === "document") {
    if (!mediaBase64) return NextResponse.json({ error: "Arquivo ausente." }, { status: 400 });
    result = await sendWhatsappMedia(contact.phone, {
      base64: mediaBase64,
      mimetype: mediaMimetype,
      fileName: mediaFileName,
      caption: body,
      mediatype: mediaType,
    });
    kind = mediaType;
    mimeType = mediaMimetype || null;
    fileName = mediaFileName || null;
  } else {
    if (!body.trim()) return NextResponse.json({ error: "Mensagem vazia" }, { status: 400 });
    result = await sendWhatsappText(contact.phone, body);
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  const displayBody = mediaType === "contact"
    ? `Contato: ${contactName} (${contactPhone})`
    : body;

  const message = await prisma.message.create({
    data: {
      contactId: id,
      body: displayBody,
      kind,
      mimeType,
      fileName,
      fromMe: true,
      status: result.simulated ? "simulado" : "enviado",
    },
  });

  return NextResponse.json({ message, simulated: !!result.simulated });
}
