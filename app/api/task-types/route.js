import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { lerCorpo, texto, nomeMuitoLongo } from "@/lib/corpo";

export async function GET() {
  const tipos = await prisma.taskType.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json(tipos);
}

export async function POST(req) {
  const body = await lerCorpo(req);
  const name = texto(body.name);
  if (!name) return NextResponse.json({ error: "Nome obrigatório." }, { status: 400 });
  if (nomeMuitoLongo(name)) return NextResponse.json({ error: "Nome muito longo." }, { status: 400 });
  const cor = /^#[0-9a-fA-F]{6}$/.test(body.color || "") ? body.color : "#6366f1";
  const emoji = typeof body.emoji === "string" ? body.emoji.slice(0, 8) : null;
  const tipo = await prisma.taskType.create({ data: { name, color: cor, emoji: emoji || null } });
  return NextResponse.json(tipo);
}
