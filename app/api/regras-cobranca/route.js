import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { lerCorpo, texto } from "@/lib/corpo";

export async function GET() {
  const regras = await prisma.regraCobranca.findMany({ orderBy: [{ ordem: "asc" }, { diasMin: "asc" }] });
  return NextResponse.json(regras);
}

export async function POST(req) {
  const body = await lerCorpo(req);
  if (!texto(body.mensagem)) {
    return NextResponse.json({ error: "Escreva a mensagem da faixa." }, { status: 400 });
  }
  // Faixa invertida (mín. 30 e máx. 1) era aceita e nunca casava com atraso
  // nenhum: a régua ficava com uma faixa morta, sem ninguém perceber.
  const dMin = Number(body.diasMin ?? 0);
  const dMax = body.diasMax === "" || body.diasMax == null ? null : Number(body.diasMax);
  if (dMax != null && dMax < dMin) {
    return NextResponse.json({ error: "O dia máximo não pode ser menor que o mínimo." }, { status: 400 });
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
