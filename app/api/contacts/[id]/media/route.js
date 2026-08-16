import { prisma } from "@/lib/prisma";
import { lerFormulario } from "@/lib/corpo";
import { NextResponse } from "next/server";
import { sendWhatsappMedia, sendWhatsappAudio, resolveInstanceForContact } from "@/lib/evolution";
import { saveMediaBuffer } from "@/lib/mediaStorage";
import { negarSeNaoPodeVerContato } from "@/lib/contatoAcesso";

const MAX_UPLOAD_MB = 25;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

const EXT = {
  "audio/webm": "webm", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/wav": "wav",
  "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp",
  "application/pdf": "pdf",
};

// Envia mídia (áudio gravado / imagem / documento) pelo WhatsApp e salva no histórico.
// A mídia fica em arquivo (volume /app/public/uploads), só o caminho vai pro banco.
export async function POST(req, { params }) {
  const { id } = await params;
  const negado = await negarSeNaoPodeVerContato(id);
  if (negado) return negado;
  const contact = await prisma.contact.findUnique({ where: { id } });
  if (!contact) return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 });

  const form = await lerFormulario(req);
  if (!form) return NextResponse.json({ error: "Envie o arquivo como formulário." }, { status: 400 });
  const file = form.get("file");
  const kind = form.get("kind") || "document"; // audio | image | document
  const caption = form.get("caption") || "";
  const instanceOverride = form.get("instance") || "";
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Arquivo ausente." }, { status: 400 });
  }

  // Não havia teto nenhum: com proxyClientMaxBodySize em 50mb, um punhado de
  // uploads grandes enche o disco da VPS — que já está com 2,5GB só de anexos.
  // Disco cheio derruba o SQLite junto, então isso para a operação inteira, não
  // só o upload. 25MB cobre com folga foto/áudio/PDF de documento.
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB). O limite é ${MAX_UPLOAD_MB}MB.` },
      { status: 413 }
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "application/octet-stream";
  const ext = EXT[mimeType] || (file.name?.split(".").pop() || "bin");
  const fileName = file.name || `${kind}.${ext}`;
  const base64 = bytes.toString("base64");
  let mediaUrl;
  try {
    mediaUrl = await saveMediaBuffer(bytes, mimeType, fileName);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }

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
