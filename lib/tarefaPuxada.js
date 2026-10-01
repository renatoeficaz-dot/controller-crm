import { prisma } from "@/lib/prisma";

// Quando o lead chega em "Análise", precisa da puxada (consulta de crédito)
// feita na ficha — essa tarefa é o lembrete disso. Mesmo padrão de
// tarefaLiberarPagamento.js.
export async function criarTarefaPuxada(contactId) {
  const [stage, tipo] = await Promise.all([
    prisma.stage.findFirst({ where: { name: "Análise" } }),
    prisma.taskType.findFirst({ where: { name: "Puchada" } }),
  ]);
  await prisma.task.create({
    data: {
      contactId,
      title: "Fazer a puxada (consulta de crédito)",
      dueDate: new Date(),
      responsavel: stage?.autoResponsavel || null,
      tipoId: tipo?.id || null,
    },
  });
}
