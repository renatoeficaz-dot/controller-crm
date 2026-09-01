import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { lerCorpo, texto } from "@/lib/corpo";

const SELECT = {
  id: true, deId: true, paraId: true, video: true, status: true, criadaEm: true,
  de: { select: { id: true, name: true } },
  para: { select: { id: true, name: true } },
};

// Estado da chamada — os dois lados consultam pra saber se foi aceita,
// recusada ou encerrada pelo outro.
export async function GET(_req, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const c = await prisma.chamadaInterna.findUnique({ where: { id }, select: SELECT });
  if (!c) return NextResponse.json({ error: "Chamada não encontrada." }, { status: 404 });
  if (c.deId !== user.id && c.paraId !== user.id) {
    return NextResponse.json({ error: "Essa chamada não é sua." }, { status: 403 });
  }
  return NextResponse.json(c);
}

// aceitar | recusar | encerrar
export async function PATCH(req, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const c = await prisma.chamadaInterna.findUnique({ where: { id } });
  if (!c) return NextResponse.json({ error: "Chamada não encontrada." }, { status: 404 });
  if (c.deId !== user.id && c.paraId !== user.id) {
    return NextResponse.json({ error: "Essa chamada não é sua." }, { status: 403 });
  }

  const acao = texto((await lerCorpo(req)).acao);
  let data;
  if (acao === "aceitar") {
    // Só quem RECEBEU atende — sem isso quem ligou "atendia" a própria chamada.
    if (c.paraId !== user.id) return NextResponse.json({ error: "Só quem recebeu pode atender." }, { status: 403 });
    data = { status: "aceita", aceitaEm: new Date() };
  } else if (acao === "recusar") {
    if (c.paraId !== user.id) return NextResponse.json({ error: "Só quem recebeu pode recusar." }, { status: 403 });
    data = { status: "recusada", encerradaEm: new Date() };
  } else if (acao === "encerrar") {
    data = { status: "encerrada", encerradaEm: new Date() };
  } else {
    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  }

  const atualizada = await prisma.chamadaInterna.update({ where: { id }, data, select: SELECT });
  return NextResponse.json(atualizada);
}
