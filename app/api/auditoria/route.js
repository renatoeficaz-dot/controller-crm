import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/session";

// Log de auditoria — só admin. Quem pode fazer as ações auditadas não deveria
// ser quem controla a visibilidade do próprio rastro.
export async function GET(req) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const acao = new URL(req.url).searchParams.get("acao");
  const logs = await prisma.auditLog.findMany({
    where: acao ? { acao } : undefined,
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json(logs);
}
