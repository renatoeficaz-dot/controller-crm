import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { lerCorpo, texto } from "@/lib/corpo";

export async function GET() {
  const lista = await prisma.campoPersonalizado.findMany({ orderBy: [{ ordem: "asc" }] });
  return NextResponse.json(lista);
}

export async function POST(req) {
  const { label, tipo, opcoes } = await lerCorpo(req);
  if (!texto(label)) return NextResponse.json({ error: "Nome obrigatório." }, { status: 400 });

  const chave = label.trim().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!chave) return NextResponse.json({ error: "Nome inválido." }, { status: 400 });

  const ultimo = await prisma.campoPersonalizado.findFirst({ orderBy: { ordem: "desc" } });
  const criado = await prisma.campoPersonalizado.create({
    data: { chave, label: label.trim(), tipo: tipo || "texto", opcoes: opcoes || null, ordem: (ultimo?.ordem ?? -1) + 1 },
  }).catch(() => null);
  if (!criado) return NextResponse.json({ error: "Já existe um campo com esse nome." }, { status: 409 });
  return NextResponse.json(criado);
}
