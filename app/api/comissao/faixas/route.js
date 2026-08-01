import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/session";

// Faixas do bônus progressivo (item 221) — só admin.
export async function GET() {
  const faixas = await prisma.comissaoFaixa.findMany({ orderBy: { minValor: "asc" } });
  return NextResponse.json(faixas);
}

export async function POST(req) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const minValor = Number(body.minValor);
  const pctBonus = Number(body.pctBonus);
  if (!minValor || minValor <= 0 || !pctBonus || pctBonus <= 0) {
    return NextResponse.json({ error: "Informe valor mínimo e % válidos." }, { status: 400 });
  }
  const faixa = await prisma.comissaoFaixa.create({ data: { minValor, pctBonus } });
  return NextResponse.json(faixa);
}
