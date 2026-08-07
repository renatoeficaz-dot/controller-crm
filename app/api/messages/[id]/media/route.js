import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { negarSeNaoPodeVerContato } from "@/lib/contatoAcesso";

// Devolve o conteúdo (base64) de uma mensagem de mídia sob demanda.
// A listagem de mensagens não traz mais esse campo para não pesar o payload.
//
// A checagem de dono não pode ser só na rota do contato: aqui a chave é o id
// da MENSAGEM, então dava pra pegar o anexo (documento, selfie, comprovante)
// de um lead de outra pessoa sem nunca tocar em /api/contacts.
export async function GET(_req, { params }) {
  const { id } = await params;
  const message = await prisma.message.findUnique({
    where: { id },
    select: { mediaUrl: true, contactId: true },
  });
  if (!message) return NextResponse.json({ error: "Não encontrada" }, { status: 404 });
  const negado = await negarSeNaoPodeVerContato(message.contactId);
  if (negado) return negado;
  return NextResponse.json({ mediaUrl: message.mediaUrl });
}
