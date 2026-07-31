import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { valorParcelaAtual } from "@/lib/finance";
import { atualizarScoreDoContato } from "@/lib/atualizarScoreComportamental";
import { registrarAuditoria } from "@/lib/auditoria";

// Baixa PARCIAL (item 93): cliente pagou parte da parcela hoje, o resto continua
// em aberto. Cada chamada soma ao Parcela.valorPago e gera um lançamento de
// entrada só do PEDAÇO recebido agora — quando a soma bate o valor devido, a
// parcela vira uma baixa completa normal (mesmo caminho de sempre).
export async function POST(req, { params }) {
  const { id } = await params;
  const { valor, formaPagamento } = await req.json();
  const v = Number(valor);
  if (!v || v <= 0) return NextResponse.json({ error: "Informe um valor válido." }, { status: 400 });

  const parcela = await prisma.parcela.findUnique({ where: { id }, include: { contact: { select: { id: true, name: true } } } });
  if (!parcela) return NextResponse.json({ error: "Parcela não encontrada." }, { status: 404 });
  if (parcela.paid) return NextResponse.json({ error: "Essa parcela já está totalmente paga." }, { status: 400 });

  const user = await getCurrentUser().catch(() => null);
  const cfg = await prisma.config.findUnique({ where: { id: "singleton" } });
  const devido = valorParcelaAtual(parcela, undefined, { multaPct: cfg?.multaPct, horaLimite: cfg?.pagamentoHoraLimite });
  const novoValorPago = Math.round((parcela.valorPago + v) * 100) / 100;
  const completaAgora = novoValorPago >= devido - 0.01; // tolerância de centavo

  const data = completaAgora
    ? {
        valorPago: novoValorPago,
        paid: true,
        paidAt: new Date(),
        amountPago: novoValorPago,
        baixadoPor: parcela.baixadoPor || user?.name || null,
        formaPagamento: formaPagamento || parcela.formaPagamento || null,
      }
    : { valorPago: novoValorPago, baixadoPor: parcela.baixadoPor || user?.name || null };

  const atualizada = await prisma.parcela.update({ where: { id }, data });

  await prisma.lancamento.create({
    data: {
      type: "entrada",
      amount: v,
      description: `Baixa parcial — parcela ${parcela.number}ª — ${parcela.contact?.name || ""}`.trim(),
      contactId: parcela.contactId,
      parcelaId: parcela.id,
      bancoId: cfg?.contaRecebimentoId || null,
    },
  });

  if (formaPagamento === "dinheiro") {
    await prisma.especieMovimento.create({
      data: { usuario: user?.name || "— sem responsável —", tipo: "recebido", valor: v, parcelaId: id },
    }).catch(() => {});
  }

  if (completaAgora) {
    await prisma.task.updateMany({ where: { parcelaId: id }, data: { done: true } });
    await atualizarScoreDoContato(parcela.contactId).catch(() => {});
  }

  registrarAuditoria({
    usuario: user?.name,
    acao: "baixa_parcial",
    entidade: "Parcela",
    entidadeId: id,
    detalhe: `${parcela.contact?.name || ""} — parcela ${parcela.number}ª recebeu R$ ${v} (${completaAgora ? "completou a parcela" : `total parcial R$ ${novoValorPago} de R$ ${devido.toFixed(2)}`})`,
  });

  return NextResponse.json({ parcela: atualizada, completou: completaAgora, faltam: completaAgora ? 0 : Math.round((devido - novoValorPago) * 100) / 100 });
}
