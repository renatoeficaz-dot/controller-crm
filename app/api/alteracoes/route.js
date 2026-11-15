import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/session";

// Log de alterações em baixas já registradas (mudar valor, ou desmarcar como
// paga) — pra auditoria, visível em Configurações > Alterações.
export async function GET() {
  // Histórico de alterações de baixa (valores, quem mudou) é auditoria financeira: só admin.
  if (!isAdmin(await getCurrentUser())) return NextResponse.json({ error: "Só o administrador." }, { status: 403 });
  const alteracoes = await prisma.alteracaoBaixa.findMany({
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  return NextResponse.json(alteracoes);
}
