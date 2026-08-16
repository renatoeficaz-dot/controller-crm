import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { lerCorpo, texto } from "@/lib/corpo";

export async function GET(req) {
  const user = await getCurrentUser();
  const tela = new URL(req.url).searchParams.get("tela") || "contatos";
  const lista = await prisma.visaoSalva.findMany({
    where: { tela, OR: [{ usuario: null }, { usuario: user?.name || "__none__" }] },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(lista);
}

export async function POST(req) {
  const user = await getCurrentUser();
  const { tela, nome, filtros, compartilhada } = await lerCorpo(req);
  if (!texto(nome) || !tela) return NextResponse.json({ error: "Nome obrigatório." }, { status: 400 });

  const criada = await prisma.visaoSalva.create({
    data: {
      tela,
      nome: nome.trim(),
      filtros: JSON.stringify(filtros || {}),
      usuario: compartilhada ? null : user?.name || null,
    },
  });
  return NextResponse.json(criada);
}
