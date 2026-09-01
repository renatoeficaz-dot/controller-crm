import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { lerCorpo } from "@/lib/corpo";

const TIPOS_VALIDOS = new Set(["pronto", "oferta", "resposta", "candidato", "encerrar"]);

async function minhaChamada(id, userId) {
  const c = await prisma.chamadaInterna.findUnique({ where: { id } });
  if (!c) return null;
  return c.deId === userId || c.paraId === userId ? c : null;
}

// Retransmissor de sinalização: cada lado lê só o que o OUTRO mandou. Áudio e
// vídeo não passam por aqui — vão direto entre os navegadores (P2P).
export async function GET(req, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const c = await minhaChamada(id, user.id);
  if (!c) return NextResponse.json({ error: "Chamada não encontrada." }, { status: 404 });

  const apos = Number(new URL(req.url).searchParams.get("apos")) || 0;
  const sinais = await prisma.chamadaInternaSinal.findMany({
    where: { chamadaId: id, deId: { not: user.id } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ total: sinais.length, sinais: apos > 0 ? sinais.slice(apos) : sinais });
}

export async function POST(req, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const c = await minhaChamada(id, user.id);
  if (!c) return NextResponse.json({ error: "Chamada não encontrada." }, { status: 404 });

  const body = await lerCorpo(req);
  if (!TIPOS_VALIDOS.has(body.tipo)) {
    return NextResponse.json({ error: "Tipo de sinal inválido." }, { status: 400 });
  }
  const payload = body.payload != null ? JSON.stringify(body.payload).slice(0, 20000) : null;
  await prisma.chamadaInternaSinal.create({
    data: { chamadaId: id, deId: user.id, tipo: body.tipo, payload },
  });
  return NextResponse.json({ ok: true });
}
