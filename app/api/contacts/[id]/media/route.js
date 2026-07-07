import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { sendWhatsappMedia, sendWhatsappAudio, resolveInstanceForContact } from "@/lib/evolution";

const EXT = {
  "audio/webm": "webm", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/wav": "wav",
  "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp",
  "application/pdf": "pdf",
};

// Envia mídia (áudio gravado / imagem / documento) pelo WhatsApp e salva no histórico.
// A mídia é guardada como data URL no próprio banco (sem disco) — funciona em serverless (Vercel).
export async function POST(req, { params }) {
  const { id } = await params;
  const contact = await prisma.contact.findUnique({ where: { id } });
  if (!contact) return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file");
  const kind = form.get("kind") || "document"; // audio | image | document
  const caption = form.get("caption") || "";
  const instanceOverride = form.get("instance") || "";
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Arquivo ausente." }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "application/octet-stream";
  const ext = EXT[mimeType] || (file.name?.split(".").pop() || "bin");
  const fileName = file.name || `${kind}.${ext}`;
  const base64 = bytes.toString("base64");
  const mediaUrl = `data:${mimeType};base64,${base64}`;

  // Por padrão responde pelo mesmo número (instância) por onde a conversa está
  // rolando — o usuário pode escolher outro número no seletor do chat.
  const instanceHint = instanceOverride || (await resolveInstanceForContact(id));

  // Envia pela Evolution (ou modo simulado)
  let result;
  if (kind === "audio") {
    result = await sendWhatsappAudio(contact.phone, base64, instanceHint);
  } else {
    result = await sendWhatsappMedia(contact.phone, {
      base64,
      mimetype: mimeType,
      fileName,
      caption,
      mediatype: kind === "image" ? "image" : "document",
    }, instanceHint);
  }
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  const message = await prisma.message.create({
    data: {
      contactId: id,
      body: caption,
      kind,
      mediaUrl,
      mimeType,
      fileName,
      fromMe: true,
      status: result.simulated ? "simulado" : "enviado",
      instance: instanceHint || null,
    },
  });

  return NextResponse.json({ message, simulated: !!result.simulated });
}
