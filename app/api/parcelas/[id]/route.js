import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Marca uma parcela como paga / pendente
export async function PATCH(req, { params }) {
  const { id } = await params;
  const body = await req.json();
  const paid = !!body.paid;
  const parcela = await prisma.parcela.update({
    where: { id },
    data: { paid, paidAt: paid ? new Date() : null },
    include: { contact: { select: { id: true, name: true } } },
  });
  // Baixar a parcela conclui a tarefa de cobrança vinculada
  await prisma.task.updateMany({ where: { parcelaId: id }, data: { done: paid } });

  // Gera/remove lançamento financeiro automático
  if (paid) {
    const cfg = await prisma.config.findUnique({ where: { id: "singleton" } });
    await prisma.lancamento.create({
      data: {
        type: "entrada",
        amount: parcela.amount,
        description: `Parcela ${parcela.number}ª — ${parcela.contact?.name || ""}`.trim(),
        contactId: parcela.contactId,
        parcelaId: parcela.id,
        bancoId: cfg?.contaRecebimentoId || null,
      },
    });
  } else {
    await prisma.lancamento.deleteMany({ where: { parcelaId: parcela.id } });
  }
  return NextResponse.json(parcela);
}
