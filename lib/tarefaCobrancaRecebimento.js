import { prisma } from "@/lib/prisma";
import { responsavelTarefasAuto } from "@/lib/responsavelTarefas";

// Ao entrar em "Recebimento" nasce uma tarefa de Cobrança (para o dono das tarefas automáticas, hoje o Arthur) no dia seguinte
// às 18:00 (Brasília). Se o cliente pagar ANTES desse horário (baixa registrada pela IA ou pela equipe), a tarefa é adiada
// para o dia seguinte, também às 18:00 — não faz sentido cobrar quem acabou de pagar.
const MARCA = "[auto-recebimento]";
const HORA_UTC = 21; // 18:00 em Brasília (UTC-3)

// 18:00 de Brasília, `dias` dias depois do dia (de Brasília) da data informada.
function as18(base, dias) {
  const br = new Date(base.getTime() - 3 * 3600e3);
  return new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), br.getUTCDate() + dias, HORA_UTC, 0, 0));
}

export async function criarTarefaCobrancaRecebimento(contactId) {
  const existe = await prisma.task.findFirst({ where: { contactId, done: false, notes: { contains: MARCA } }, select: { id: true } });
  if (existe) return null;
  const tipo = await prisma.taskType.findFirst({ where: { name: { contains: "Cobran" } } });
  return prisma.task.create({
    data: {
      contactId,
      title: "Cobrança",
      notes: MARCA,
      dueDate: as18(new Date(), 1),
      responsavel: await responsavelTarefasAuto(null),
      tipoId: tipo?.id || null,
    },
  });
}

// Chamado quando uma baixa é registrada: se a tarefa ainda não venceu, empurra para o dia seguinte às 18:00.
export async function adiarTarefaCobrancaRecebimento(contactId) {
  const agora = new Date();
  const tarefas = await prisma.task.findMany({ where: { contactId, done: false, notes: { contains: MARCA }, dueDate: { gt: agora } } });
  for (const t of tarefas) {
    await prisma.task.update({ where: { id: t.id }, data: { dueDate: as18(t.dueDate, 1) } });
  }
  return tarefas.length;
}
