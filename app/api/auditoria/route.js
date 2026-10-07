import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/session";

// Log de auditoria — só admin. Quem pode fazer as ações auditadas não deveria
// ser quem controla a visibilidade do próprio rastro.
export async function GET(req) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const params = new URL(req.url).searchParams;
  const acao = params.get("acao");
  const entidadeId = params.get("entidadeId"); // histórico completo de um cliente/entidade
  const logs = await prisma.auditLog.findMany({
    where: { ...(acao ? { acao } : {}), ...(entidadeId ? { entidadeId } : {}) },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json(logs);
}
