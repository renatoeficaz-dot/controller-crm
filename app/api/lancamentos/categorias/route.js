import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const cats = await prisma.lancamentoCategoria.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(cats);
}

export async function POST(req) {
  const { name, type } = await req.json().catch(() => ({}));
  if (!(name || "").trim() || !["entrada", "saida"].includes(type)) {
    return NextResponse.json({ error: "Nome e tipo (entrada/saida) obrigatórios." }, { status: 400 });
  }
  const cat = await prisma.lancamentoCategoria.create({ data: { name: name.trim(), type } });
  return NextResponse.json(cat);
}
