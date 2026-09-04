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

  // Mesmo risco do bloqueio acima, mas pra acordo: regerar apagava TAMBÉM as
  // parcelas do acordo (deAcordo) e desfazia o "renegociada" das antigas —
  // o cliente saía com um plano de 10 parcelas novas em folha, como se o
  // acordo nunca tivesse existido, e voltava a contar como atrasado desde a
  // data original. O Negociacao (histórico) sobrevivia, então parecia que
  // teve acordo mas as parcelas não batiam com ele — foi assim que o caso da
  // Suely costa (acordo de 01/08 apagado por um "Atualizar parcelas" depois)
  // foi descoberto.
  const temAcordo = await prisma.parcela.count({
    where: { contactId, ciclo, OR: [{ renegociada: true }, { deAcordo: true }] },
  });
  if (temAcordo > 0) {
    return {
      error: "Este ciclo tem um acordo parcelado ativo. Regerar apagaria o acordo e voltaria a cobrar o plano original. Ajuste pelo acordo em vez de regerar.",
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

    // Tarefa de cobrança não nasce mais sozinha aqui — quem cobra decide
    // manualmente quando criar a tarefa (Tarefas → + Tarefa).
    //
    // createMany em vez de 10 creates em loop: cada create individual é uma
    // ida e volta ao banco, e enquanto essa transação está aberta ela segura
    // o único lock de escrita do SQLite — quanto mais tempo, maior a chance
    // de travar quem estiver escrevendo em paralelo (uma mensagem chegando,
    // a IA respondendo). Uma escrita só resolve isso em vez de 10.
    await tx.parcela.createMany({ data: novas.map((p) => ({ ...p, contactId, ciclo })) });
  }, { timeout: 20000 });

  const parcelas = await prisma.parcela.findMany({
    where: { contactId },
    orderBy: { number: "asc" },
  });
  return { parcelas };
}

// Lança automaticamente uma saída no valor do capital liberado, debitando da
// conta configurada como "conta de liberação" — dispara ao lead ENTRAR em
// "Recebimento". Idempotente POR CICLO: cada renovação libera capital de novo
// (ciclo 2, 3...), então a checagem de duplicidade tem que considerar o ciclo
// — antes checava só "já existe ALGUM lançamento de liberação pra esse
// contato" (startsWith), e isso fazia a 2ª liberação em diante (renovação)
// nunca ser lançada: o dinheiro saía de verdade mas o caixa nunca registrava.
export async function lancarLiberacaoCapital(contact) {
  if (!contact?.valorCapital) return false;
  const cfg = await prisma.config.findUnique({ where: { id: "singleton" } });
  if (!cfg?.contaLiberacaoId) return false;

  const descricao = `Liberação de capital — ${contact.name}${contact.cicloAtual > 1 ? ` (ciclo ${contact.cicloAtual})` : ""}`;
  const already = await prisma.lancamento.findFirst({
    where: { contactId: contact.id, type: "saida", description: descricao },
  });
  if (already) return false;

  await prisma.lancamento.create({
    data: {
      type: "saida",
      amount: contact.valorCapital,
      description: descricao,
      contactId: contact.id,
      bancoId: cfg.contaLiberacaoId,
    },
  });
  return true;
}
