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
  // Teto nos números (Int no schema): sem ele, um valor fora da faixa de 32
  // bits corrompia a LINHA (mesmo bug já corrigido em /api/config e
  // /api/users/[id] — toda leitura seguinte dessa regra quebrava com 500).
  const clamp = (v, def) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(100000, Math.max(-100000, n)) : def;
  };
  const dMin = clamp(body.diasMin, 0);
  const dMax = body.diasMax === "" || body.diasMax == null ? null : clamp(body.diasMax, null);
  if (dMax != null && dMax < dMin) {
    return NextResponse.json({ error: "O dia máximo não pode ser menor que o mínimo." }, { status: 400 });
  }
  const regra = await prisma.regraCobranca.create({
    data: {
      diasMin: dMin,
      diasMax: dMax,
      mensagem: body.mensagem.trim(),
      ativa: body.ativa !== false,
      ordem: clamp(body.ordem, 0),
    },
  });
  return NextResponse.json(regra);
}
