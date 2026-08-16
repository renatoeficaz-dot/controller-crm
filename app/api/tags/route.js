import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { lerCorpo, texto } from "@/lib/corpo";

export async function GET() {
  const tags = await prisma.tag.findMany({
    orderBy: { name: "asc" },
    include: { rules: { orderBy: { createdAt: "asc" } } },
  });
  return NextResponse.json(tags);
}

export async function POST(req) {
  const { name, color } = await lerCorpo(req);
  if (!texto(name)) {
    return NextResponse.json({ error: "Nome da tag é obrigatório." }, { status: 400 });
  }
  // Só cor hexadecimal: qualquer outro texto era aceito e a etiqueta saía
  // sem cor nenhuma na tela (o navegador ignora o valor inválido no estilo).
  const cor = /^#[0-9a-fA-F]{6}$/.test(color || "") ? color : "#6366f1";
  const tag = await prisma.tag.create({ data: { name: name.trim(), color: cor } });
  return NextResponse.json(tag);
}
