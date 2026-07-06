import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Lista os números conectados (com o usuário atribuído)
export async function GET() {
  const numbers = await prisma.whatsappNumber.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: { id: true, name: true } },
      agent: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json(numbers);
}

// Conecta/cadastra um novo número
export async function POST(req) {
  const body = await req.json();
  const label = (body.label || "").trim();
  const number = (body.number || "").trim();
  const instance = (body.instance || "").trim();
  if (!label || !number || !instance) {
    return NextResponse.json({ error: "Preencha nome, número e instância." }, { status: 400 });
  }
  const created = await prisma.whatsappNumber.create({
    data: { label, number, instance, userId: body.userId || null },
    include: {
      user: { select: { id: true, name: true } },
      agent: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json(created);
}
