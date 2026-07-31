import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/session";

const hojeUTC = () => new Date(new Date().toLocaleDateString("en-CA") + "T00:00:00.000Z");

export async function GET(req) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const pedido = sp.get("usuario");
  const usuario = isAdmin(user) ? pedido : user.name;

  const lista = await prisma.prestacaoContas.findMany({
    where: usuario ? { usuario } : {},
    orderBy: { dia: "desc" },
    take: 60,
  });
  return NextResponse.json(lista);
}

// Um registro por pessoa por dia — reenviar no mesmo dia atualiza (upsert).
export async function POST(req) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { visitas, recebidoDinheiro, recebidoPix, observacao } = await req.json();
  const dia = hojeUTC();
  const data = {
    visitas: visitas != null ? Number(visitas) : null,
    recebidoDinheiro: recebidoDinheiro != null ? Number(recebidoDinheiro) : null,
    recebidoPix: recebidoPix != null ? Number(recebidoPix) : null,
    observacao: observacao || null,
  };

  const registro = await prisma.prestacaoContas.upsert({
    where: { usuario_dia: { usuario: user.name, dia } },
    update: data,
    create: { usuario: user.name, dia, ...data },
  });
  return NextResponse.json(registro);
}
