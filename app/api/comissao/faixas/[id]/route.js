import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { registrarAuditoria } from "@/lib/auditoria";

export async function DELETE(_req, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const faixa = await prisma.comissaoFaixa.findUnique({ where: { id } });
  await prisma.comissaoFaixa.delete({ where: { id } });
  registrarAuditoria({
    usuario: user.name,
    acao: "alterar_config",
    entidade: "ComissaoFaixa",
    entidadeId: id,
    detalhe: faixa ? `Excluiu faixa de bônus: a partir de R$ ${faixa.minValor} → ${faixa.pctBonus}%` : "Excluiu faixa de bônus",
  });
  return NextResponse.json({ ok: true });
}
