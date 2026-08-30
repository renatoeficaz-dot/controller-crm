import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { negarSeNaoPodeVerContato } from "@/lib/contatoAcesso";

// Feed de atividade do lead pro chat: junta mudanças de etapa (EtapaLog) e
// edições de campo (AuditLog, ação "editar_campo") num único histórico,
// mais recente primeiro. usuario null = feito pela IA; usuario preenchido =
// feito por aquele usuário.
export async function GET(_req, { params }) {
  const { id } = await params;
  const negado = await negarSeNaoPodeVerContato(id);
  if (negado) return negado;

  const [etapas, campos] = await Promise.all([
    prisma.etapaLog.findMany({ where: { contactId: id }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.auditLog.findMany({
      where: { entidade: "Contact", entidadeId: id, acao: "editar_campo" },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const itens = [
    ...etapas.map((e) => ({
      tipo: "etapa",
      usuario: e.usuario,
      detalhe: `moveu de "${e.deEtapa || "—"}" para "${e.paraEtapa}"`,
      createdAt: e.createdAt,
    })),
    ...campos.map((c) => ({
      tipo: "campo",
      usuario: c.usuario,
      detalhe: c.detalhe,
      createdAt: c.createdAt,
    })),
  ]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 25);

  return NextResponse.json(itens);
}
