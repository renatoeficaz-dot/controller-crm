import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Lista as mensagens prontas (ordenadas)
export async function GET() {
  const templates = await prisma.messageTemplate.findMany({ orderBy: { order: "asc" } });
  return NextResponse.json(templates);
}

// Cria uma mensagem pronta
export async function POST(req) {
  const data = await req.json();
  const title = (data.title || "").trim();
  const body = (data.body || "").trim();
  if (!title || !body) {
    return NextResponse.json({ error: "Preencha o título e a mensagem." }, { status: 400 });
  }
  const last = await prisma.messageTemplate.findFirst({ orderBy: { order: "desc" } });
  const tpl = await prisma.messageTemplate.create({
    data: { title, body, order: (last?.order ?? -1) + 1 },
  });
  return NextResponse.json(tpl);
}
