import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { valorParcelaAtual } from "@/lib/finance";
import { registrarAuditoria } from "@/lib/auditoria";
import { negarSeNaoPodeVerContato } from "@/lib/contatoAcesso";
import { lerCorpo, texto } from "@/lib/corpo";

// Item 165: cobrador muda o valor de uma parcela — pra menos (desconto) ou
// pra mais (ex.: parcela reagendada, juro combinado à parte). Aplica na hora
// (sem precisar de aprovação de admin — tirado a pedido do Renato: "pode
// liberar para todos"), e trava o valor (valorFixado) pra não sofrer multa de
// novo. O registro em SolicitacaoDesconto continua só como histórico/auditoria.
export async function POST(req, { params }) {
  const { id } = await params;
  // Aqui a chave é o id da PARCELA, não do contato — sem essa checagem dava
  // pra mexer no dinheiro (dar baixa, mudar vencimento, mudar valor) de um
  // lead de outra pessoa só trocando o id na URL.
  const _p = await prisma.parcela.findUnique({ where: { id }, select: { contactId: true } });
  if (!_p) return NextResponse.json({ error: "Parcela não encontrada." }, { status: 404 });
  const negado = await negarSeNaoPodeVerContato(_p.contactId);
  if (negado) return negado;
  const body = await lerCorpo(req);
  const valorPedido = Number(body.valorPedido);
  const motivo = texto(body.motivo);
  if (!valorPedido || valorPedido <= 0) return NextResponse.json({ error: "Informe o novo valor." }, { status: 400 });
  if (!motivo) return NextResponse.json({ error: "Informe o motivo da mudança de valor." }, { status: 400 });

  const parcela = await prisma.parcela.findUnique({ where: { id }, include: { contact: { select: { name: true } } } });
  if (!parcela) return NextResponse.json({ error: "Parcela não encontrada." }, { status: 404 });
  if (parcela.paid) return NextResponse.json({ error: "Essa parcela já está paga." }, { status: 400 });

  const user = await getCurrentUser().catch(() => null);
  const cfg = await prisma.config.findUnique({ where: { id: "singleton" } });
  const valorOriginal = valorParcelaAtual(parcela, undefined, { multaPct: cfg?.multaPct, horaLimite: cfg?.pagamentoHoraLimite });
  if (valorPedido === valorOriginal) {
    return NextResponse.json({ error: "O valor pedido é igual ao valor atual da parcela." }, { status: 400 });
  }

  await prisma.parcela.update({ where: { id }, data: { amount: valorPedido, valorFixado: true } });

  const solicitacao = await prisma.solicitacaoDesconto.create({
    data: {
      parcelaId: id,
      contactNome: parcela.contact?.name || "",
      parcelaNumero: parcela.number,
      valorOriginal,
      valorPedido,
      motivo,
      solicitadoPor: user?.name || null,
      status: "aprovado",
      respondidoPor: user?.name || null,
      respondidoEm: new Date(),
    },
  });

  registrarAuditoria({
    usuario: user?.name,
    acao: "mudar_valor_parcela",
    entidade: "Parcela",
    entidadeId: id,
    detalhe: `${parcela.contact?.name || ""} — parcela ${parcela.number}ª: R$ ${valorOriginal} → R$ ${valorPedido} (${motivo})`,
  });

  return NextResponse.json(solicitacao);
}
