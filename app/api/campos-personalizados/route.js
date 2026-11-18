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
    // Tipo fora da lista virava campo que a ficha não sabe desenhar; opções que não são texto derrubavam o Prisma.
    data: { chave, label: label.trim(), tipo: ["texto", "numero", "data", "opcoes", "sim_nao"].includes(tipo) ? tipo : "texto", opcoes: typeof opcoes === "string" ? opcoes.slice(0, 2000) : Array.isArray(opcoes) ? opcoes.filter((o) => typeof o === "string").join(",") : null, ordem: (ultimo?.ordem ?? -1) + 1 },
  }).catch(() => null);
  if (!criado) return NextResponse.json({ error: "Já existe um campo com esse nome." }, { status: 409 });
  return NextResponse.json(criado);
}
