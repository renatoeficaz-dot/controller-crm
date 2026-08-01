import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";

// Tempo de uso do sistema: o cliente manda um "heartbeat" a cada 30s enquanto
// o usuário estiver de fato ativo (mouse/teclado nos últimos 60s, aba em
// primeiro plano) — cada heartbeat soma 30s no dia de hoje.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const hoje = new Date(new Date().toLocaleDateString("en-CA") + "T00:00:00.000Z");
  await prisma.usoDiario.upsert({
    where: { usuario_dia: { usuario: user.name, dia: hoje } },
    update: { segundos: { increment: 30 } },
    create: { usuario: user.name, dia: hoje, segundos: 30 },
  });
  return NextResponse.json({ ok: true });
}
