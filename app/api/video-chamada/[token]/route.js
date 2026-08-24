import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Rota PÚBLICA (sem login) — o cliente abre pelo link do WhatsApp. Devolve só
// o necessário pra tela pública decidir qual passo mostrar (nunca dados
// internos do lead: nome, CPF, etc. não têm por que ir pra cá).
export async function GET(_req, { params }) {
  const { token } = await params;
  const sessao = await prisma.videoChamadaSessao.findUnique({ where: { token } });
  if (!sessao) return NextResponse.json({ error: "Link inválido ou expirado." }, { status: 404 });
  return NextResponse.json({
    aceito: !!sessao.aceitoEm,
    capturado: !!sessao.capturadoEm,
    entrouNaSala: !!sessao.entrouNaSalaEm,
  });
}
