import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Rota PÚBLICA — marca o consentimento do cliente. Nada de câmera/localização
// é pedido pro navegador ANTES desse aceite existir (a tela pública só chama
// getUserMedia/geolocation depois que essa chamada responder ok).
export async function POST(_req, { params }) {
  const { token } = await params;
  const sessao = await prisma.videoChamadaSessao.findUnique({ where: { token } });
  if (!sessao) return NextResponse.json({ error: "Link inválido ou expirado." }, { status: 404 });
  if (!sessao.aceitoEm) {
    await prisma.videoChamadaSessao.update({ where: { token }, data: { aceitoEm: new Date() } });
  }
  return NextResponse.json({ ok: true });
}
