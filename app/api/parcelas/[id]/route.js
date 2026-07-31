import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { atualizarScoreDoContato } from "@/lib/atualizarScoreComportamental";
import { registrarAuditoria } from "@/lib/auditoria";
import { podeExecutar } from "@/lib/permissoes";

// Marca uma parcela como paga / pendente.
// body.amountPago (opcional): valor realmente cobrado — permite ao cobrador
// dar baixa SEM o juro de atraso (aliviando o cliente) mesmo com a parcela
// vencida. Se não vier, usa o valor base da parcela (sem juro).
// body.motivo: obrigatório quando a parcela JÁ estava paga antes (mudar o
// valor de uma baixa existente, ou desmarcar como paga) — fica registrado
// em AlteracaoBaixa, visível em Configurações > Alterações.
export async function PATCH(req, { params }) {
  const { id } = await params;
  const body = await req.json();
  const paid = !!body.paid;
  const parcelaAtual = await prisma.parcela.findUnique({
    where: { id },
    include: { contact: { select: { name: true } } },
  });
  if (!parcelaAtual) return NextResponse.json({ error: "Parcela não encontrada." }, { status: 404 });

  const user = await getCurrentUser().catch(() => null);

  const amountPago = paid
    ? (body.amountPago != null && body.amountPago !== "" ? Number(body.amountPago) : parcelaAtual.amount)
    : null;

  // É uma ALTERAÇÃO (não a baixa original) quando a parcela já estava paga e
  // o valor está mudando, ou quando está sendo desmarcada como paga.
  const ehAlteracao = parcelaAtual.paid && (!paid || amountPago !== parcelaAtual.amountPago);
  if (ehAlteracao) {
    // Ação sensível (item 43): estornar exige "estornar_baixa"; mudar valor de
    // baixa já feita exige "editar_valor_baixa" — admin sempre pode as duas.
    const acaoNecessaria = paid ? "editar_valor_baixa" : "estornar_baixa";
    if (!podeExecutar(user, acaoNecessaria)) {
      return NextResponse.json({ error: "Sem permissão para essa alteração." }, { status: 403 });
    }
    const motivo = (body.motivo || "").trim();
    if (!motivo) {
      return NextResponse.json({ error: "Informe o motivo da alteração." }, { status: 400 });
    }
    await prisma.alteracaoBaixa.create({
      data: {
        parcelaId: id,
        contactNome: parcelaAtual.contact?.name || "",
        parcelaNumero: parcelaAtual.number,
        valorAntigo: parcelaAtual.amountPago,
        valorNovo: amountPago,
        motivo,
        usuarioNome: user?.name || null,
      },
    });
  }

  const parcela = await prisma.parcela.update({
    where: { id },
    data: {
      paid,
      paidAt: paid ? (parcelaAtual.paidAt || new Date()) : null,
      amountPago,
      // Quem deu a baixa — base da comissão e do comparativo entre cobradores.
      // Preserva o autor original numa alteração de valor: quem recuperou foi
      // quem cobrou, não quem corrigiu o valor depois.
      baixadoPor: paid ? (parcelaAtual.baixadoPor || user?.name || null) : null,
      formaPagamento: paid ? (body.formaPagamento || parcelaAtual.formaPagamento || null) : null,
    },
    include: { contact: { select: { id: true, name: true } } },
  });

  // Controle de espécie (item 32): baixa em DINHEIRO fica em mãos do cobrador
  // até ele depositar — nasce/morre junto com a baixa, nunca solto.
  if (paid && parcela.formaPagamento === "dinheiro" && !parcelaAtual.paid) {
    await prisma.especieMovimento.create({
      data: { usuario: parcela.baixadoPor || "— sem responsável —", tipo: "recebido", valor: amountPago, parcelaId: id },
    }).catch(() => {});
  }
  if (!paid) {
    await prisma.especieMovimento.deleteMany({ where: { parcelaId: id, tipo: "recebido" } }).catch(() => {});
  }
  // Baixar a parcela conclui a tarefa de cobrança vinculada
  await prisma.task.updateMany({ where: { parcelaId: id }, data: { done: paid } });

  // Gera/remove/atualiza o lançamento financeiro automático
  if (paid) {
    const existente = await prisma.lancamento.findFirst({ where: { parcelaId: parcela.id } });
    if (existente) {
      await prisma.lancamento.update({ where: { id: existente.id }, data: { amount: amountPago } });
    } else {
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
    }
  } else {
    await prisma.lancamento.deleteMany({ where: { parcelaId: parcela.id } });
  }

  // O score comportamental depende do histórico de pagamento — recalcula aqui
  // pra refletir a baixa na hora, sem esperar a varredura diária.
  await atualizarScoreDoContato(parcela.contactId).catch(() => {});

  registrarAuditoria({
    usuario: user?.name,
    acao: paid ? "dar_baixa" : "estornar_baixa",
    entidade: "Parcela",
    entidadeId: id,
    detalhe: `${parcela.contact?.name || ""} — parcela ${parcela.number}ª${paid ? ` baixada em R$ ${amountPago}` : " desmarcada"}`,
  });

  return NextResponse.json(parcela);
}
