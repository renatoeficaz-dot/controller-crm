import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { lerCorpo } from "@/lib/corpo";
import { negarSeNaoPodeVerContato } from "@/lib/contatoAcesso";
import { getCurrentUser } from "@/lib/session";

const TIPOS_VALIDOS = new Set(["pronto", "oferta", "resposta", "candidato", "encerrar"]);

// Lado do ATENDENTE (autenticado) do retransmissor de sinalização — espelho
// de app/api/video-chamada/[token]/sinal/route.js, do lado público.
export async function GET(req, { params }) {
  const { sessaoId } = await params;
  const sessao = await prisma.videoChamadaSessao.findUnique({ where: { id: sessaoId } });
  if (!sessao) return NextResponse.json({ error: "Sessão não encontrada." }, { status: 404 });
  const negado = await negarSeNaoPodeVerContato(sessao.contactId);
  if (negado) return negado;

  const apos = Number(new URL(req.url).searchParams.get("apos")) || 0;
  const sinais = await prisma.videoChamadaSinal.findMany({
    where: { sessaoId: sessao.id, de: "cliente" },
    orderBy: { createdAt: "asc" },
  });
  const novos = apos > 0 ? sinais.slice(apos) : sinais;
  return NextResponse.json({ total: sinais.length, sinais: novos });
}

export async function POST(req, { params }) {
  const { sessaoId } = await params;
  const sessao = await prisma.videoChamadaSessao.findUnique({ where: { id: sessaoId } });
  if (!sessao) return NextResponse.json({ error: "Sessão não encontrada." }, { status: 404 });
  const negado = await negarSeNaoPodeVerContato(sessao.contactId);
  if (negado) return negado;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const body = await lerCorpo(req);
  if (!TIPOS_VALIDOS.has(body.tipo)) {
    return NextResponse.json({ error: "Tipo de sinal inválido." }, { status: 400 });
  }
  const payload = body.payload != null ? JSON.stringify(body.payload).slice(0, 20000) : null;
  await prisma.videoChamadaSinal.create({
    data: { sessaoId: sessao.id, de: "staff", tipo: body.tipo, payload },
  });
  return NextResponse.json({ ok: true });
}
