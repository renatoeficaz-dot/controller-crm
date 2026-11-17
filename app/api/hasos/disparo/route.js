import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { lerCorpo, texto } from "@/lib/corpo";

// Registra o clique em "Ligar" (Hasos): quem ligou, por qual número e se a Hasos aceitou iniciar.
// Serve pra contar as ligações por colaborador no relatório (a Hasos não sabe quem do time ligou).
export async function POST(req) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const body = await lerCorpo(req);
  const instanceId = texto(body.instanceId).slice(0, 80);
  const fone = String(body.telefone || "").replace(/\D/g, "").slice(0, 20);
  if (!instanceId || fone.length < 10) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  // Clique repetido em menos de 3s conta uma vez só.
  const recente = await prisma.hasosDisparo.findFirst({ where: { userId: user.id, criadoEm: { gte: new Date(Date.now() - 3000) } }, select: { id: true } });
  if (recente) return NextResponse.json({ ok: true, repetido: true });
  const ok = body.ok !== false;
  await prisma.hasosDisparo.create({
    data: { userId: user.id, instanceId, fone, ok, erro: ok ? null : texto(body.erro).slice(0, 200) || null },
  });
  return NextResponse.json({ ok: true });
}
