import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const SELECT = {
  id: true,
  nome: true,
  metaVendasMinima: true,
  metaVendasMedia: true,
  metaVendasDia: true,
  metaPctRecebimentoMinima: true,
  metaPctRecebimentoMedia: true,
  metaPctRecebimento: true,
  membros: { select: { id: true, name: true } },
  createdAt: true,
};

export async function GET() {
  const equipes = await prisma.equipe.findMany({ orderBy: { nome: "asc" }, select: SELECT });
  return NextResponse.json(equipes);
}

export async function POST(req) {
  const body = await req.json().catch(() => ({})) ?? {};
  const nome = (body.nome || "").trim();
  if (!nome) return NextResponse.json({ error: "Nome da equipe é obrigatório." }, { status: 400 });
  const existe = await prisma.equipe.findUnique({ where: { nome } });
  if (existe) return NextResponse.json({ error: "Já existe uma equipe com esse nome." }, { status: 409 });
  const equipe = await prisma.equipe.create({ data: { nome }, select: SELECT });
  return NextResponse.json(equipe);
}
