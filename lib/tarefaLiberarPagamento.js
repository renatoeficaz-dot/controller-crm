import { prisma } from "@/lib/prisma";

// Quando o lead chega em "Liberação pagamento", alguém precisa fazer o Pix de
// verdade — essa tarefa é o lembrete disso. Mesmo padrão de
// tarefaConferirPagamento.js: atribuída a quem está configurado como
// responsável automático da etapa (sem isso, fica sem responsável, visível
// em "Todos").
export async function criarTarefaLiberarPagamento(contactId) {
  const stage = await prisma.stage.findFirst({ where: { name: "Liberação pagamento" } });
  await prisma.task.create({
    data: {
      contactId,
      title: "Liberar pagamento do cliente",
      dueDate: new Date(),
      responsavel: stage?.autoResponsavel || null,
    },
  });
}
