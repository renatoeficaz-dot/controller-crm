import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { lerCorpo } from "@/lib/corpo";

// Transforma uma mídia já recebida no chat num Documento organizado por tipo
// — não duplica o arquivo, só aponta pro mesmo /uploads/... já salvo.
export async function POST(req) {
  const { messageId, tipo } = await lerCorpo(req);
  if (!messageId || !tipo) return NextResponse.json({ error: "Dados incompletos." }, { status: 400 });

  const msg = await prisma.message.findUnique({ where: { id: messageId } });
  if (!msg?.mediaUrl) return NextResponse.json({ error: "Mensagem sem mídia." }, { status: 404 });

  const documento = await prisma.documento.create({
    data: { contactId: msg.contactId, tipo, url: msg.mediaUrl, fileName: msg.fileName, mimeType: msg.mimeType },
  });
  return NextResponse.json(documento);
}
