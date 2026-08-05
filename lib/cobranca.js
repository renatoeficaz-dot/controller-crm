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
  // Apagar e recriar precisa ser ATÔMICO: duas chamadas simultâneas (mover pro
  // funil + clicar em regerar, ou clique duplo) se intercalavam entre o delete
  // e os creates e o cliente acabava com parcela duplicada — cobrança dobrada.
  // Regerar apagava TAMBÉM as parcelas já pagas: sumia o registro do pagamento
  // (quem deu baixa, quando, quanto) e o lançamento do caixa ficava apontando
  // pra uma parcela que não existe mais. Ao marcar de novo, nascia um segundo
  // lançamento do MESMO dinheiro — o caixa contava duas vezes.
  const jaPagas = await prisma.parcela.count({ where: { contactId, ciclo, paid: true } });
  if (jaPagas > 0) {
    return {
      error: `Este ciclo já tem ${jaPagas} parcela(s) paga(s). Regerar apagaria esses pagamentos e duplicaria o valor no caixa. Use "baixa parcial", "ajustar vencimento" ou um acordo.`,
      status: 409,
    };
  }

  await prisma.$transaction(async (tx) => {
    // ciclo é NOT NULL no schema (default 1) — não há registros com ciclo nulo.
    const antigas = await tx.parcela.findMany({ where: { contactId, ciclo }, select: { id: true } });
    const antigasIds = antigas.map((p) => p.id);
    // Nenhuma está paga (checado acima), então não há dinheiro real ligado a
    // elas — mas se sobrou algum lançamento apontando pra essas parcelas, ele
    // vira órfão no caixa. Limpa junto.
    await tx.lancamento.deleteMany({ where: { parcelaId: { in: antigasIds } } });
    await tx.task.deleteMany({ where: { contactId, parcelaId: { in: antigasIds } } });
    await tx.parcela.deleteMany({ where: { id: { in: antigasIds } } });

    for (const p of novas) {
      const parcela = await tx.parcela.create({ data: { ...p, contactId, ciclo } });
      // Tarefa de cobrança sempre às 11h (horário do servidor, America/Sao_Paulo)
      // — depois do horário em que o cliente deveria ter pago (10h). Reconstrói
      // a partir do Y-M-D (não usa setHours direto: p.dueDate é meia-noite UTC,
      // que em horário local já é o dia anterior — setHours voltaria um dia).
      const ymd = p.dueDate.toISOString().slice(0, 10);
      const taskDueDate = new Date(`${ymd}T11:00:00`);
      await tx.task.create({
        data: {
          contactId,
          parcelaId: parcela.id,
          title: `Cobrar ${p.number}ª parcela de ${contact.name}`,
          dueDate: taskDueDate,
        },
      });
    }
  }, { timeout: 20000 });

  const parcelas = await prisma.parcela.findMany({
    where: { contactId },
    orderBy: { number: "asc" },
  });
  return { parcelas };
}

// Lança automaticamente uma saída no valor do capital liberado, debitando da
// conta configurada como "conta de liberação" — dispara ao lead ENTRAR em
// "Recebimento". Idempotente: não duplica se já lançou pra esse contato.
export async function lancarLiberacaoCapital(contact) {
  if (!contact?.valorCapital) return false;
  const cfg = await prisma.config.findUnique({ where: { id: "singleton" } });
  if (!cfg?.contaLiberacaoId) return false;

  const already = await prisma.lancamento.findFirst({
    where: { contactId: contact.id, type: "saida", description: { startsWith: "Liberação de capital" } },
  });
  if (already) return false;

  await prisma.lancamento.create({
    data: {
      type: "saida",
      amount: contact.valorCapital,
      description: `Liberação de capital — ${contact.name}`,
      contactId: contact.id,
      bancoId: cfg.contaLiberacaoId,
    },
  });
  return true;
}
