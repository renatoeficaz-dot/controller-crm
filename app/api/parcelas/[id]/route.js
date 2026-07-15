import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Marca uma parcela como paga / pendente.
// body.amountPago (opcional): valor realmente cobrado — permite ao cobrador
// dar baixa SEM o juro de atraso (aliviando o cliente) mesmo com a parcela
// vencida. Se não vier, usa o valor base da parcela (sem juro).
export async function PATCH(req, { params }) {
  const { id } = await params;
  const body = await req.json();
  const paid = !!body.paid;
  const parcelaAtual = await prisma.parcela.findUnique({ where: { id } });
  if (!parcelaAtual) return NextResponse.json({ error: "Parcela não encontrada." }, { status: 404 });

  const amountPago = paid
    ? (body.amountPago != null && body.amountPago !== "" ? Number(body.amountPago) : parcelaAtual.amount)
    : null;

  const parcela = await prisma.parcela.update({
    where: { id },
    data: { paid, paidAt: paid ? new Date() : null, amountPago },
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
        amount: amountPago,
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
