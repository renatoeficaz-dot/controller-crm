import { prisma } from "@/lib/prisma";

// Quando o cobrador dá baixa num pagamento, quem cuida da liberação de
// capital precisa conferir que o dinheiro realmente entrou antes de liberar o
// próximo ciclo — essa tarefa é o lembrete disso. Atribuída a quem está
// configurado como responsável automático da etapa "Liberação pagamento"
// (mesmo campo usado pra atribuição automática ao mover de coluna); sem isso
// configurado, a tarefa fica sem responsável (visível em "Todos").
export async function criarTarefaConferirPagamento(contactId) {
  const stage = await prisma.stage.findFirst({ where: { name: "Liberação pagamento" } });
  await prisma.task.create({
    data: {
      contactId,
      title: "Conferir pagamento do cliente",
      dueDate: new Date(),
      responsavel: stage?.autoResponsavel || null,
    },
  });
}
