import { prisma } from "@/lib/prisma";

// Quando o lead chega em "Liberação pagamento", alguém precisa fazer o Pix de
// verdade — essa tarefa é o lembrete disso. Mesmo padrão de
// tarefaConferirPagamento.js: atribuída a quem está configurado como
// responsável automático da etapa (sem isso, fica sem responsável, visível
// em "Todos").
export async function criarTarefaLiberarPagamento(contactId) {
  const [contact, stage, tipo] = await Promise.all([
    prisma.contact.findUnique({ where: { id: contactId }, select: { valorCapital: true, pixChave: true, pixNomeCompleto: true } }),
    prisma.stage.findFirst({ where: { name: "Liberação pagamento" } }),
    prisma.taskType.findFirst({ where: { name: "Liberar pagamento" } }),
  ]);
  // Quem vai fazer o Pix precisa ver na própria tarefa: valor, chave e nome de quem recebe.
  const partes = [];
  if (Number(contact?.valorCapital) > 0) partes.push("R$ " + Number(contact.valorCapital).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  if (contact?.pixChave) partes.push("Pix: " + contact.pixChave);
  if (contact?.pixNomeCompleto) partes.push("Recebedor: " + contact.pixNomeCompleto);
  const titulo = "Liberar pagamento do cliente" + (partes.length ? " — " + partes.join(" · ") : "");
  await prisma.task.create({
    data: {
      contactId,
      title: titulo,
      dueDate: new Date(),
      responsavel: stage?.autoResponsavel || null,
      tipoId: tipo?.id || null,
    },
  });
  // Aviso pro dono: o número "secretaria-gb" (GrowthBrand, instância da Evolution) manda só "Nova lead" a cada tarefa de liberação.
  try {
    const { sendWhatsappText } = await import("@/lib/evolution");
    await sendWhatsappText("5511930888128", "Nova lead", "secretaria-gb");
  } catch {}
}
