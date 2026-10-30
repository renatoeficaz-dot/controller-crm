import { prisma } from "@/lib/prisma";

// Tipo de tarefa "Erro": tarefas que a IA abre quando o cliente sai do fluxo ou não consegue segui-lo.
// Cria o tipo na primeira vez que for preciso.
export async function tipoErroId() {
  const achado = await prisma.taskType.findFirst({ where: { name: { equals: "Erro" } } }).catch(() => null);
  if (achado) return achado.id;
  const novo = await prisma.taskType.create({ data: { name: "Erro", color: "#dc2626", emoji: "⚠️" } }).catch(() => null);
  return novo?.id || null;
}
