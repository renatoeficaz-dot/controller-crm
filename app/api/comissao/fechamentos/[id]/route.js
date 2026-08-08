import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { podeExecutar } from "@/lib/permissoes";
import { registrarAuditoria } from "@/lib/auditoria";

// pendente -> aprovado -> pago. Cada passo só anda pra frente.
export async function PATCH(req, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!podeExecutar(user, "aprovar_comissao")) {
    return NextResponse.json({ error: "Sem permissão para aprovar comissão." }, { status: 403 });
  }

  const { status } = await req.json().catch(() => ({}));
  if (!["aprovado", "pago"].includes(status)) {
    return NextResponse.json({ error: "Status inválido." }, { status: 400 });
  }

  const atual = await prisma.comissaoFechamento.findUnique({ where: { id } });
  if (!atual) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (status === "pago" && atual.status === "pendente") {
    return NextResponse.json({ error: "Aprove antes de marcar como pago." }, { status: 400 });
  }

  const data = { status };
  if (status === "aprovado") { data.aprovadoPor = user.name; data.aprovadoEm = new Date(); }
  if (status === "pago") data.pagoEm = new Date();

  const fechamento = await prisma.comissaoFechamento.update({ where: { id }, data });
  registrarAuditoria({
    usuario: user.name,
    acao: "aprovar_comissao",
    entidade: "ComissaoFechamento",
    entidadeId: id,
    detalhe: `${fechamento.usuario}: comissão da semana ${fechamento.semanaInicio.toISOString().slice(0,10)} -> ${status}`,
  });
  return NextResponse.json(fechamento);
}
