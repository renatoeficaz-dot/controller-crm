import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const lista = await prisma.motivoPerda.findMany({ orderBy: [{ ordem: "asc" }, { nome: "asc" }] });
  return NextResponse.json(lista);
}

export async function POST(req) {
  const { nome } = await req.json();
  if (!nome?.trim()) return NextResponse.json({ error: "Nome obrigatório." }, { status: 400 });
  const criado = await prisma.motivoPerda.create({ data: { nome: nome.trim() } }).catch(() => null);
  if (!criado) return NextResponse.json({ error: "Já existe um motivo com esse nome." }, { status: 409 });
  return NextResponse.json(criado);
}
