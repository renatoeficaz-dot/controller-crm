import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const tipos = await prisma.taskType.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json(tipos);
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const name = (body.name || "").trim();
  if (!name) return NextResponse.json({ error: "Nome obrigatório." }, { status: 400 });
  const tipo = await prisma.taskType.create({ data: { name, color: body.color || "#6366f1" } });
  return NextResponse.json(tipo);
}
