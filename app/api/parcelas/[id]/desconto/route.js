import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { valorParcelaAtual } from "@/lib/finance";

// Item 165: cobrador pede desconto pontual numa parcela — só vira valor de
// verdade quando um admin aprovar (ver app/api/solicitacoes-desconto).
export async function POST(req, { params }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const valorPedido = Number(body.valorPedido);
  const motivo = (body.motivo || "").trim();
  if (!valorPedido || valorPedido <= 0) return NextResponse.json({ error: "Informe o valor com desconto." }, { status: 400 });
  if (!motivo) return NextResponse.json({ error: "Informe o motivo do desconto." }, { status: 400 });

  const parcela = await prisma.parcela.findUnique({ where: { id }, include: { contact: { select: { name: true } } } });
  if (!parcela) return NextResponse.json({ error: "Parcela não encontrada." }, { status: 404 });
  if (parcela.paid) return NextResponse.json({ error: "Essa parcela já está paga." }, { status: 400 });

  const user = await getCurrentUser().catch(() => null);
  const cfg = await prisma.config.findUnique({ where: { id: "singleton" } });
  const valorOriginal = valorParcelaAtual(parcela, undefined, { multaPct: cfg?.multaPct, horaLimite: cfg?.pagamentoHoraLimite });
  if (valorPedido >= valorOriginal) {
    return NextResponse.json({ error: "O valor pedido precisa ser menor que o valor atual da parcela." }, { status: 400 });
  }

  const pendenteExistente = await prisma.solicitacaoDesconto.findFirst({ where: { parcelaId: id, status: "pendente" } });
  if (pendenteExistente) return NextResponse.json({ error: "Já existe um pedido de desconto pendente pra essa parcela." }, { status: 409 });

  const solicitacao = await prisma.solicitacaoDesconto.create({
    data: {
      parcelaId: id,
      contactNome: parcela.contact?.name || "",
      parcelaNumero: parcela.number,
      valorOriginal,
      valorPedido,
      motivo,
      solicitadoPor: user?.name || null,
    },
  });
  return NextResponse.json(solicitacao);
}
