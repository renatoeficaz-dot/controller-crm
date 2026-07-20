import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Log de alterações em baixas já registradas (mudar valor, ou desmarcar como
// paga) — pra auditoria, visível em Configurações > Alterações.
export async function GET() {
  const alteracoes = await prisma.alteracaoBaixa.findMany({
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  return NextResponse.json(alteracoes);
}
