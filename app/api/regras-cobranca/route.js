import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const regras = await prisma.regraCobranca.findMany({ orderBy: [{ ordem: "asc" }, { diasMin: "asc" }] });
  return NextResponse.json(regras);
}

export async function POST(req) {
  const body = await req.json();
  if (!body.mensagem?.trim()) {
    return NextResponse.json({ error: "Escreva a mensagem da faixa." }, { status: 400 });
  }
  const regra = await prisma.regraCobranca.create({
    data: {
      diasMin: Number(body.diasMin ?? 0),
      diasMax: body.diasMax === "" || body.diasMax == null ? null : Number(body.diasMax),
      mensagem: body.mensagem.trim(),
      ativa: body.ativa !== false,
      ordem: Number(body.ordem ?? 0),
    },
  });
  return NextResponse.json(regra);
}
