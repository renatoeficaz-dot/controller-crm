import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { lerCorpo } from "@/lib/corpo";
import { negarSeNaoPodeVerContato } from "@/lib/contatoAcesso";

// Transforma uma mídia já recebida no chat num Documento organizado por tipo
// — não duplica o arquivo, só aponta pro mesmo /uploads/... já salvo.
export async function POST(req) {
  const { messageId, tipo } = await lerCorpo(req);
  if (!messageId || !tipo) return NextResponse.json({ error: "Dados incompletos." }, { status: 400 });

  const msg = await prisma.message.findUnique({ where: { id: messageId } });
  if (!msg?.mediaUrl) return NextResponse.json({ error: "Mensagem sem mídia." }, { status: 404 });
  // Transformar mídia de conversa em documento só pra lead que a pessoa pode ver.
  const negado = await negarSeNaoPodeVerContato(msg.contactId);
  if (negado) return negado;
  if (typeof tipo !== "string" || tipo.length > 40) return NextResponse.json({ error: "Tipo inválido." }, { status: 400 });

  const documento = await prisma.documento.create({
    data: { contactId: msg.contactId, tipo, url: msg.mediaUrl, fileName: msg.fileName, mimeType: msg.mimeType },
  });
  return NextResponse.json(documento);
}
