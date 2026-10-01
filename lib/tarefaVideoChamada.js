import { prisma } from "@/lib/prisma";

// Quando o lead chega em "Vídeo chamada", alguém precisa agendar/fazer a
// verificação com o cliente — essa tarefa é o lembrete disso. Mesmo padrão
// de tarefaLiberarPagamento.js.
export async function criarTarefaVideoChamada(contactId) {
  const [stage, tipo] = await Promise.all([
    prisma.stage.findFirst({ where: { name: "Vídeo chamada" } }),
    prisma.taskType.findFirst({ where: { name: "Vídeo Chamada" } }),
  ]);
  await prisma.task.create({
    data: {
      contactId,
      title: "Vídeo chamada com o cliente",
      dueDate: new Date(),
      responsavel: stage?.autoResponsavel || null,
      tipoId: tipo?.id || null,
    },
  });
}
