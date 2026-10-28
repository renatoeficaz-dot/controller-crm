import { prisma } from "@/lib/prisma";

// Quando o lead chega em "Análise", precisa da puxada (consulta de crédito)
// feita na ficha — essa tarefa é o lembrete disso. Mesmo padrão de
// tarefaLiberarPagamento.js.
// A puxada só é feita das 09:00 às 11:00 (Brasília, segunda a sábado): dentro da janela vale "agora"; antes das 09:00 vai para
// as 09:00 de hoje; depois das 11:00 (ou domingo, ou sábado depois das 14:00 como no aviso de análise) vai para as 09:00 do próximo dia útil.
export function proximoHorarioDePuxada(agora = new Date()) {
  const br = new Date(agora.getTime() - 3 * 3600e3); // relógio de Brasília lido em UTC
  const min = br.getUTCHours() * 60 + br.getUTCMinutes();
  const dia = br.getUTCDay(); // 0 = domingo
  const fimDaJanela = 11 * 60;
  if (dia !== 0 && min >= 9 * 60 && min < fimDaJanela) return agora;
  const d = new Date(br);
  if (dia === 0 || min >= fimDaJanela) d.setUTCDate(d.getUTCDate() + 1);
  if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1); // domingo não tem análise
  return new Date(`${d.toISOString().slice(0, 10)}T09:00:00-03:00`);
}

export async function criarTarefaPuxada(contactId) {
  const [stage, tipo] = await Promise.all([
    prisma.stage.findFirst({ where: { name: "Análise" } }),
    prisma.taskType.findFirst({ where: { name: "Puchada" } }),
  ]);
  await prisma.task.create({
    data: {
      contactId,
      title: "Fazer a puxada (consulta de crédito)",
      dueDate: proximoHorarioDePuxada(),
      responsavel: stage?.autoResponsavel || null,
      tipoId: tipo?.id || null,
    },
  });
}
