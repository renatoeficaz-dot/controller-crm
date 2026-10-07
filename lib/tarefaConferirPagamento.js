import { prisma } from "@/lib/prisma";

// Quando o cobrador dá baixa num pagamento, quem cuida da liberação de
// capital precisa conferir que o dinheiro realmente entrou antes de liberar o
// próximo ciclo — essa tarefa é o lembrete disso. Atribuída a quem está
// configurado como responsável automático da etapa "Liberação pagamento"
// (mesmo campo usado pra atribuição automática ao mover de coluna); sem isso
// configurado, a tarefa fica sem responsável (visível em "Todos").
export async function criarTarefaConferirPagamento(contactId, { parcelaId, valor, forma } = {}) {
  const [stage, tipo] = await Promise.all([
    prisma.stage.findFirst({ where: { name: "Liberação pagamento" } }),
    prisma.taskType.findFirst({ where: { name: "conferir pagamento" } }),
  ]);
  // Valor na descrição: quem confere vê quanto tem que ter entrado sem abrir a ficha.
  const parcela = parcelaId ? await prisma.parcela.findUnique({ where: { id: parcelaId }, select: { number: true, amountPago: true, formaPagamento: true, baixadoPor: true } }).catch(() => null) : null;
  const valorNum = Number(valor ?? parcela?.amountPago);
  const brl = Number.isFinite(valorNum) && valorNum > 0 ? valorNum.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : null;
  const formaTxt = forma || parcela?.formaPagamento;
  const notes = [
    brl ? `Valor pago: ${brl}` : null,
    parcela?.number ? `Parcela ${parcela.number}ª` : null,
    formaTxt ? `Forma: ${formaTxt}` : null,
    parcela?.baixadoPor ? `Baixa dada por: ${parcela.baixadoPor}` : null,
  ].filter(Boolean).join(" · ") || null;
  await prisma.task.create({
    data: {
      contactId,
      title: brl ? `Conferir pagamento do cliente — ${brl}` : "Conferir pagamento do cliente",
      notes,
      dueDate: new Date(),
      responsavel: stage?.autoResponsavel || null,
      tipoId: tipo?.id || null,
    },
  });
}
