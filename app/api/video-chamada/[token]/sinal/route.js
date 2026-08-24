import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { lerCorpo } from "@/lib/corpo";

const TIPOS_VALIDOS = new Set(["pronto", "oferta", "resposta", "candidato", "encerrar"]);

// Rota PÚBLICA — lado do CLIENTE do retransmissor de sinalização WebRTC.
// GET: sinais que o ATENDENTE mandou, mais novos que "apos".
// POST: manda um sinal do cliente pro atendente.
// Só funciona depois de aceite + captura já feitos (mesma trava das outras
// rotas dessa sessão) — sem isso não tem vídeo chamada pra sinalizar.
export async function GET(req, { params }) {
  const { token } = await params;
  const sessao = await prisma.videoChamadaSessao.findUnique({ where: { token } });
  if (!sessao) return NextResponse.json({ error: "Link inválido ou expirado." }, { status: 404 });

  const apos = Number(new URL(req.url).searchParams.get("apos")) || 0;
  const sinais = await prisma.videoChamadaSinal.findMany({
    where: { sessaoId: sessao.id, de: "staff" },
    orderBy: { createdAt: "asc" },
  });
  const novos = apos > 0 ? sinais.slice(apos) : sinais;
  return NextResponse.json({ total: sinais.length, sinais: novos });
}

export async function POST(req, { params }) {
  const { token } = await params;
  const sessao = await prisma.videoChamadaSessao.findUnique({ where: { token } });
  if (!sessao) return NextResponse.json({ error: "Link inválido ou expirado." }, { status: 404 });
  if (!sessao.aceitoEm || !sessao.capturadoEm) {
    return NextResponse.json({ error: "Verificação ainda não concluída." }, { status: 400 });
  }

  const body = await lerCorpo(req);
  if (!TIPOS_VALIDOS.has(body.tipo)) {
    return NextResponse.json({ error: "Tipo de sinal inválido." }, { status: 400 });
  }
  const payload = body.payload != null ? JSON.stringify(body.payload).slice(0, 20000) : null;
  await prisma.videoChamadaSinal.create({
    data: { sessaoId: sessao.id, de: "cliente", tipo: body.tipo, payload },
  });
  return NextResponse.json({ ok: true });
}
