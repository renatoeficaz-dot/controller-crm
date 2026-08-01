import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { registrarAuditoria } from "@/lib/auditoria";

// Item 185: transfere de uma vez todos os leads de um cobrador/vendedor pra
// outro — usado quando alguém sai da equipe ou troca de função. Só mexe em
// Contact.responsavel (dono atual do lead); histórico de quem cobrou cada
// baixa (Parcela.baixadoPor) fica intocado, é registro do que já aconteceu.
export async function POST(req) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const de = (body.de || "").trim();
  const para = (body.para || "").trim();
  const apenasEmRecebimento = !!body.apenasEmRecebimento;
  if (!de || !para) return NextResponse.json({ error: "Informe quem transfere e quem recebe." }, { status: 400 });
  if (de === para) return NextResponse.json({ error: "Origem e destino não podem ser a mesma pessoa." }, { status: 400 });

  const where = { responsavel: de, excluidoEm: null };
  if (apenasEmRecebimento) {
    const stage = await prisma.stage.findFirst({ where: { name: "Recebimento" } });
    if (stage) where.stageId = stage.id;
  }

  const alvos = await prisma.contact.findMany({ where, select: { id: true } });
  if (alvos.length === 0) return NextResponse.json({ transferidos: 0 });

  await prisma.contact.updateMany({ where, data: { responsavel: para } });
  await prisma.responsavelLog.createMany({
    data: alvos.map((c) => ({ contactId: c.id, de, para, usuario: user.name })),
  });

  registrarAuditoria({
    usuario: user.name,
    acao: "transferir_carteira",
    entidade: "Contact",
    detalhe: `${alvos.length} lead(s) transferido(s) de ${de} para ${para}${apenasEmRecebimento ? " (só em Recebimento)" : ""}`,
  });

  return NextResponse.json({ transferidos: alvos.length });
}
