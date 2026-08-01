import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/session";

// Lista pedidos de desconto pendentes de aprovação — só admin.
export async function GET(req) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const status = sp.get("status") || "pendente";
  const lista = await prisma.solicitacaoDesconto.findMany({
    where: status === "todas" ? {} : { status },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(lista);
}
