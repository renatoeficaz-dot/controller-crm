import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { fecharSemanaAnterior } from "@/lib/comissaoFechamento";

export async function GET(req) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const pedido = new URL(req.url).searchParams.get("usuario");
  const usuario = isAdmin(user) ? pedido : user.name;

  const lista = await prisma.comissaoFechamento.findMany({
    where: usuario ? { usuario } : {},
    orderBy: { semanaInicio: "desc" },
    take: 30,
  });
  return NextResponse.json(lista);
}

// Admin pode forçar o fechamento da semana anterior fora do horário automático
// (job já roda sozinho aos domingos — ver instrumentation.js).
export async function POST() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Só admin." }, { status: 403 });
  const criados = await fecharSemanaAnterior();
  return NextResponse.json({ criados });
}
