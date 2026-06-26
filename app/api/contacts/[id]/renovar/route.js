import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { gerarParcelas } from "@/lib/finance";

// Renova o empréstimo: incrementa o ciclo, gera novas parcelas com os dados fornecidos.
// Exige que TODAS as parcelas do ciclo atual estejam pagas.
export async function POST(req, { params }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const contact = await prisma.contact.findUnique({
    where: { id },
    include: { parcelas: true },
  });
  if (!contact) return NextResponse.json({ error: "Contato não encontrado." }, { status: 404 });

  const parcelasAtuais = contact.parcelas.filter((p) => p.ciclo === contact.cicloAtual);
  if (parcelasAtuais.length === 0) {
    return NextResponse.json({ error: "Gere as parcelas do ciclo atual primeiro." }, { status: 400 });
  }
  const naoPagas = parcelasAtuais.filter((p) => !p.paid);
  if (naoPagas.length > 0) {
    return NextResponse.json({ error: `Ainda há ${naoPagas.length} parcela(s) em aberto no ciclo atual.` }, { status: 400 });
  }

  const valorCapital = Number(body.valorCapital);
  const pagamentoCapital = body.pagamentoCapital;
  if (!valorCapital || !pagamentoCapital) {
    return NextResponse.json({ error: "Informe o Valor do capital e a Data de pagamento da renovação." }, { status: 400 });
  }

  const novoCiclo = contact.cicloAtual + 1;
  const config = await prisma.config.findUnique({ where: { id: "singleton" } });
  const pct = config?.honorariosPct ?? 30;
  const novasParcelas = gerarParcelas(valorCapital, pct, pagamentoCapital);

  // Atualiza o contato (novo ciclo + novos valores de capital)
  await prisma.contact.update({
    where: { id },
    data: {
      cicloAtual: novoCiclo,
      valorCapital,
      pagamentoCapital: new Date(pagamentoCapital),
    },
  });

  // Limpa tarefas do ciclo anterior (mantém as parcelas como histórico)
  await prisma.task.deleteMany({ where: { contactId: id, parcela: { ciclo: { lt: novoCiclo } } } });

  // Cria novas parcelas + tarefas do novo ciclo
  for (const p of novasParcelas) {
    const parcela = await prisma.parcela.create({
      data: { ...p, contactId: id, ciclo: novoCiclo },
    });
    await prisma.task.create({
      data: {
        contactId: id,
        parcelaId: parcela.id,
        title: `Cobrar ${p.number}ª parcela de ${contact.name} (renovação ${novoCiclo - 1})`,
        dueDate: p.dueDate,
      },
    });
  }

  const parcelas = await prisma.parcela.findMany({
    where: { contactId: id },
    orderBy: [{ ciclo: "asc" }, { number: "asc" }],
  });
  return NextResponse.json({ cicloAtual: novoCiclo, parcelas });
}
