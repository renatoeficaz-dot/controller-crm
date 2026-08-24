import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { negarSeNaoPodeVerContato } from "@/lib/contatoAcesso";

// Lado do ATENDENTE (autenticado) da mesma sessão de vídeo chamada — status
// pra saber se o cliente já passou pela verificação e já está na tela de
// chamada, pra decidir quando faz sentido tentar conectar.
export async function GET(_req, { params }) {
  const { sessaoId } = await params;
  const sessao = await prisma.videoChamadaSessao.findUnique({
    where: { id: sessaoId },
    include: { contact: { select: { name: true } } },
  });
  if (!sessao) return NextResponse.json({ error: "Sessão não encontrada." }, { status: 404 });
  const negado = await negarSeNaoPodeVerContato(sessao.contactId);
  if (negado) return negado;

  return NextResponse.json({
    contactName: sessao.contact.name,
    aceito: !!sessao.aceitoEm,
    capturado: !!sessao.capturadoEm,
    entrouNaSala: !!sessao.entrouNaSalaEm,
  });
}
