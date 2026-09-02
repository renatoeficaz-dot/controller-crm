import { prisma } from "@/lib/prisma";
import { calcularPagamentoSemana, textoRelatorio } from "@/lib/pagamentoCobrador";

// Todo sábado às 16h fecha e ENTREGA o acerto de cada cobrador configurado:
// grava o resultado e manda o relatório no chat interno pra própria pessoa.
//
// Grava o resultado em vez de só recalcular na hora porque as metas do dia
// mudam junto com a carteira — recalcular semanas depois daria outro número,
// e o acerto já foi pago com o número desta sexta.
export async function gerarRelatoriosPagamentoSabado(agora = new Date()) {
  const configs = await prisma.pagamentoCobradorConfig.findMany({
    where: { ativo: true },
    include: { user: { select: { id: true, name: true } } },
  });
  if (!configs.length) return 0;

  let gerados = 0;
  for (const cfg of configs) {
    const r = await calcularPagamentoSemana(cfg.userId, agora);
    if (!r) continue;

    const inicio = new Date(r.inicio + "T00:00:00.000Z");
    // @@unique([userId, inicio]) faz o upsert ser idempotente: se a rotina
    // rodar duas vezes no mesmo sábado, atualiza em vez de duplicar o acerto.
    const jaExistia = await prisma.pagamentoCobradorSemana.findUnique({
      where: { userId_inicio: { userId: r.userId, inicio } },
      select: { id: true },
    });
    await prisma.pagamentoCobradorSemana.upsert({
      where: { userId_inicio: { userId: r.userId, inicio } },
      create: {
        userId: r.userId, nome: r.nome, inicio,
        fim: new Date(r.fim + "T00:00:00.000Z"),
        fixo: r.fixo, bonusTotal: r.bonusTotal, total: r.total,
        diasBatidos: r.diasBatidos, detalhe: JSON.stringify(r.detalhe),
      },
      update: {
        fixo: r.fixo, bonusTotal: r.bonusTotal, total: r.total,
        diasBatidos: r.diasBatidos, detalhe: JSON.stringify(r.detalhe),
      },
    });
    gerados += 1;
    // Já entregue neste sábado: não repete a mensagem no chat.
    if (jaExistia) continue;
    await mandarNoChatInterno(r);
  }
  return gerados;
}

// Manda na conversa direta com a pessoa — cria a conversa se ainda não existe.
async function mandarNoChatInterno(r) {
  // Quem "assina" a mensagem precisa ser OUTRA pessoa: se o próprio cobrador
  // fosse o autor, a mensagem nasceria como lida e ele nunca receberia o aviso
  // (e uma conversa direta consigo mesmo não existe).
  const admin = await prisma.user.findFirst({
    where: { role: "admin", id: { not: r.userId } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (!admin) return;

  // Conversa direta entre os dois: exatamente 2 membros e não é grupo.
  const candidatas = await prisma.conversaInterna.findMany({
    where: { grupo: false, membros: { some: { userId: r.userId } } },
    include: { membros: { select: { userId: true } } },
  });
  let conversa = candidatas.find(
    (c) => c.membros.length === 2 && c.membros.some((m) => m.userId === admin.id)
  );
  if (!conversa) {
    conversa = await prisma.conversaInterna.create({
      data: {
        grupo: false,
        criadaPor: "sistema",
        membros: { create: [{ userId: r.userId }, { userId: admin.id }] },
      },
      include: { membros: { select: { userId: true } } },
    });
  }

  await prisma.mensagemInterna.create({
    data: { conversaId: conversa.id, autorId: admin.id, body: textoRelatorio(r) },
  });
  await prisma.conversaInterna.update({
    where: { id: conversa.id },
    data: { updatedAt: new Date() },
  });
}
