import { prisma } from "@/lib/prisma";

// Quando o cobrador dá baixa num pagamento, quem cuida da liberação de
// capital precisa conferir que o dinheiro realmente entrou antes de liberar o
// próximo ciclo — essa tarefa é o lembrete disso. Atribuída a quem está
// configurado como responsável automático da etapa "Liberação pagamento"
// (mesmo campo usado pra atribuição automática ao mover de coluna); sem isso
// configurado, a tarefa fica sem responsável (visível em "Todos").
const JANELA_MS = 10 * 60 * 1000;

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
  // Baixas dadas juntas (várias parcelas de uma vez, ou em sequência) = UMA tarefa só, com o total somado.
  const recente = await prisma.task.findFirst({
    where: { contactId, done: false, tipoId: tipo?.id || undefined, title: { startsWith: "Conferir pagamento do cliente" }, createdAt: { gte: new Date(Date.now() - JANELA_MS) } },
    orderBy: { createdAt: "desc" },
  });
  if (recente) {
    const m = (recente.notes || "").match(/\[(\d+) baixas; total ([\d.]+)\]/);
    const qtd = (m ? Number(m[1]) : 1) + 1;
    const total = (m ? Number(m[2]) : Number((recente.title.match(/R\$\s*([\d.]+,\d{2})/)?.[1] || "0").replace(/\./g, "").replace(",", "."))) + (Number.isFinite(valorNum) ? valorNum : 0);
    const totalBrl = total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const detalhe = (recente.notes || "").replace(/ ?\[\d+ baixas; total [\d.]+\]/, "").replace(/^Total das baixas: [^\n]*\n?/, "");
    await prisma.task.update({
      where: { id: recente.id },
      data: {
        title: `Conferir pagamento do cliente — ${totalBrl} (${qtd} baixas)`,
        notes: `Total das baixas: ${totalBrl} em ${qtd} parcelas\n${[detalhe, notes].filter(Boolean).join("\n")} [${qtd} baixas; total ${total.toFixed(2)}]`,
      },
    });
    return;
  }
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
