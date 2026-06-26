import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const tags = await prisma.tag.findMany({
    orderBy: { name: "asc" },
    include: { rules: { orderBy: { createdAt: "asc" } } },
  });
  return NextResponse.json(tags);
}

export async function POST(req) {
  const { name, color } = await req.json().catch(() => ({}));
  if (!(name || "").trim()) {
    return NextResponse.json({ error: "Nome da tag é obrigatório." }, { status: 400 });
  }
  const tag = await prisma.tag.create({ data: { name: name.trim(), color: color || "#6366f1" } });
  return NextResponse.json(tag);
}
