import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Rota PÚBLICA — libera a sala de vídeo só depois do aceite + captura já
// terem acontecido (mesma trava do lado do servidor, não só escondendo botão
// no front). Sala é a Jitsi Meet pública (meet.jit.si) — sem servidor de
// sinalização/TURN próprio, o nome da sala já é a "senha" (prefixo fixo +
// token, então ninguém adivinha um nome de sala alheio).
export async function POST(_req, { params }) {
  const { token } = await params;
  const sessao = await prisma.videoChamadaSessao.findUnique({ where: { token } });
  if (!sessao) return NextResponse.json({ error: "Link inválido ou expirado." }, { status: 404 });
  if (!sessao.aceitoEm) return NextResponse.json({ error: "É preciso aceitar antes de continuar." }, { status: 400 });
  if (!sessao.capturadoEm) return NextResponse.json({ error: "Verificação ainda não concluída." }, { status: 400 });

  if (!sessao.entrouNaSalaEm) {
    await prisma.videoChamadaSessao.update({ where: { token }, data: { entrouNaSalaEm: new Date() } });
  }
  return NextResponse.json({ sala: `crmcapcred-${token}` });
}
