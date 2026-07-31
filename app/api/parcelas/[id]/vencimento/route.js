import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { registrarAuditoria } from "@/lib/auditoria";

// Muda o vencimento de uma parcela (itens 103/104 — alterar data ou "adiar"
// são a mesma operação). Sempre com motivo, registrado em ParcelaAjuste.
export async function PATCH(req, { params }) {
  const { id } = await params;
  const { novoVencimento, motivo } = await req.json();
  if (!novoVencimento) return NextResponse.json({ error: "Informe a nova data." }, { status: 400 });
  if (!motivo?.trim()) return NextResponse.json({ error: "Informe o motivo." }, { status: 400 });

  const parcela = await prisma.parcela.findUnique({ where: { id }, include: { contact: { select: { name: true } }, task: true } });
  if (!parcela) return NextResponse.json({ error: "Parcela não encontrada." }, { status: 404 });
  if (parcela.paid) return NextResponse.json({ error: "Parcela já paga não pode ter o vencimento alterado." }, { status: 400 });

  const user = await getCurrentUser().catch(() => null);
  const vencimentoDepois = new Date(novoVencimento + "T00:00:00.000Z");

  await prisma.parcelaAjuste.create({
    data: {
      parcelaId: id,
      vencimentoAntes: parcela.dueDate,
      vencimentoDepois,
      motivo: motivo.trim(),
      usuario: user?.name || null,
    },
  });

  const atualizada = await prisma.parcela.update({ where: { id }, data: { dueDate: vencimentoDepois } });

  // A tarefa de cobrança (uma por parcela) segue junto — senão o lembrete
  // continua aparecendo na data antiga.
  if (parcela.task) {
    await prisma.task.update({ where: { id: parcela.task.id }, data: { dueDate: vencimentoDepois } }).catch(() => {});
  }

  registrarAuditoria({
    usuario: user?.name,
    acao: "alterar_vencimento_parcela",
    entidade: "Parcela",
    entidadeId: id,
    detalhe: `${parcela.contact?.name || ""} — parcela ${parcela.number}ª: ${parcela.dueDate.toISOString().slice(0,10)} -> ${novoVencimento} (${motivo.trim()})`,
  });

  return NextResponse.json(atualizada);
}
