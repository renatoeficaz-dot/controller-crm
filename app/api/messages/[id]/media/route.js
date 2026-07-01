import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Devolve o conteúdo (base64) de uma mensagem de mídia sob demanda.
// A listagem de mensagens não traz mais esse campo para não pesar o payload.
export async function GET(_req, { params }) {
  const { id } = await params;
  const message = await prisma.message.findUnique({
    where: { id },
    select: { mediaUrl: true },
  });
  if (!message) return NextResponse.json({ error: "Não encontrada" }, { status: 404 });
  return NextResponse.json({ mediaUrl: message.mediaUrl });
}
