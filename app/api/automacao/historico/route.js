import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/session";

// Histórico de atribuições automáticas de responsável (mais recente primeiro).
export async function GET() {
  // Log de atribuição automática (quem recebeu qual lead) é da tela de Configurações: só admin.
  if (!isAdmin(await getCurrentUser())) return NextResponse.json({ error: "Só o administrador." }, { status: 403 });
  const logs = await prisma.atribuicaoLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json(logs);
}
