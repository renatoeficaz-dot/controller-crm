import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { lerCorpo } from "@/lib/corpo";

export async function GET() {
  const bancos = await prisma.banco.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(bancos);
}

export async function POST(req) {
  const { name } = await lerCorpo(req);
  if (!(name || "").trim()) {
    return NextResponse.json({ error: "Nome do banco é obrigatório." }, { status: 400 });
  }
  const banco = await prisma.banco.create({ data: { name: name.trim() } });
  return NextResponse.json(banco);
}
