import { prisma } from "@/lib/prisma";
import { gerarParcelas } from "@/lib/finance";

// (Re)gera as 10 parcelas diárias + a tarefa de cobrança de cada uma.
// Usado tanto na geração automática (entrar em Recebimento) quanto na manual.
export async function regenerarParcelas(contactId) {
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact) return { error: "Contato não encontrado", status: 404 };
  if (!contact.valorCapital || !contact.pagamentoCapital) {
    return { error: "Defina o Valor do capital e o Pagamento de capital.", status: 400 };
  }

  const config = await prisma.config.findUnique({ where: { id: "singleton" } });
  const pct = config?.honorariosPct ?? 30;
  const novas = gerarParcelas(contact.valorCapital, pct, contact.pagamentoCapital);

  const ciclo = contact.cicloAtual || 1;
  // Recria parcelas do ciclo atual (apaga parcelas e tarefas deste ciclo)
  // Inclui ciclo=null (parcelas migradas antes do campo existir)
  const cicloFilter = { OR: [{ ciclo }, { ciclo: null }] };
  await prisma.task.deleteMany({ where: { contactId, parcela: { is: cicloFilter } } });
  await prisma.parcela.deleteMany({ where: { contactId, ...cicloFilter } });

  for (const p of novas) {
    const parcela = await prisma.parcela.create({ data: { ...p, contactId, ciclo } });
    await prisma.task.create({
      data: {
        contactId,
        parcelaId: parcela.id,
        title: `Cobrar ${p.number}ª parcela de ${contact.name}`,
        dueDate: p.dueDate,
      },
    });
  }

  const parcelas = await prisma.parcela.findMany({
    where: { contactId },
    orderBy: { number: "asc" },
  });
  return { parcelas };
}
