import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { registrarAuditoria } from "@/lib/auditoria";
import { lerCorpo } from "@/lib/corpo";

// Faixas do bônus progressivo (item 221) — só admin.
export async function GET() {
  const faixas = await prisma.comissaoFaixa.findMany({ orderBy: { minValor: "asc" } });
  return NextResponse.json(faixas);
}

export async function POST(req) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const body = await lerCorpo(req);
  const minValor = Number(body.minValor);
  const pctBonus = Number(body.pctBonus);
  if (!minValor || minValor <= 0 || !pctBonus || pctBonus <= 0) {
    return NextResponse.json({ error: "Informe valor mínimo e % válidos." }, { status: 400 });
  }
  // Teto de 100%: digitar 500 em vez de 5 faria a empresa pagar de bônus cinco
  // vezes o que foi recuperado, e o erro só apareceria no acerto da semana.
  if (pctBonus > 100) {
    return NextResponse.json({ error: "O bônus não pode passar de 100% do valor recuperado." }, { status: 400 });
  }
  const faixa = await prisma.comissaoFaixa.create({ data: { minValor, pctBonus } });
  registrarAuditoria({
    usuario: user.name,
    acao: "alterar_config",
    entidade: "ComissaoFaixa",
    entidadeId: faixa.id,
    detalhe: `Criou faixa de bônus: a partir de R$ ${minValor} → ${pctBonus}%`,
  });
  return NextResponse.json(faixa);
}
