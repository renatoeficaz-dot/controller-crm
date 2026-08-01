import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";

const INTERVALO_S = 30; // o cliente manda 1 heartbeat a cada 30s
const TOLERANCIA_S = 25; // aceita um pouco antes, pra absorver atraso de rede

// Tempo de uso do sistema: o cliente manda um "heartbeat" a cada 30s enquanto
// o usuário estiver de fato ativo (mouse/teclado nos últimos 60s, aba em
// primeiro plano) — cada heartbeat aceito soma 30s no dia de hoje.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const agora = new Date();
  const hoje = new Date(agora.toLocaleDateString("en-CA") + "T00:00:00.000Z");

  const atual = await prisma.usoDiario.findUnique({
    where: { usuario_dia: { usuario: user.name, dia: hoje } },
    select: { ultimoEm: true },
  });

  // Ignora batidas mais rápidas que o intervalo real: sem essa trava, bastava
  // chamar a rota em laço pra registrar horas de uso que não existiram.
  if (atual?.ultimoEm && (agora - new Date(atual.ultimoEm)) / 1000 < TOLERANCIA_S) {
    return NextResponse.json({ ok: true, ignorado: true });
  }

  await prisma.usoDiario.upsert({
    where: { usuario_dia: { usuario: user.name, dia: hoje } },
    update: { segundos: { increment: INTERVALO_S }, ultimoEm: agora },
    create: { usuario: user.name, dia: hoje, segundos: INTERVALO_S, ultimoEm: agora },
  });
  return NextResponse.json({ ok: true });
}
