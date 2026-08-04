import { prisma } from "@/lib/prisma";
import { NUM_PARCELAS, valorEmAberto as emAbertoDaParcela } from "@/lib/finance";

// Item 155: parcela em aberto (dinheiro que ainda não entrou) de um lead que
// foi excluído — ninguém está cobrando esse dinheiro porque o lead sumiu da
// tela. Não é um erro do banco (a FK garante que sempre existe um Contact),
// é um lead esquecido que ainda deve.
export async function parcelasOrfas() {
  const contatos = await prisma.contact.findMany({
    where: { excluidoEm: { not: null } },
    select: {
      id: true,
      name: true,
      phone: true,
      excluidoEm: true,
      parcelas: { where: { paid: false, renegociada: false }, select: { amount: true, number: true, dueDate: true } },
    },
  });
  return contatos
    .filter((c) => c.parcelas.length > 0)
    .map((c) => ({
      contactId: c.id,
      nome: c.name,
      phone: c.phone,
      excluidoEm: c.excluidoEm,
      qtdParcelas: c.parcelas.length,
      valorEmAberto: Math.round(c.parcelas.reduce((s, p) => s + emAbertoDaParcela(p), 0) * 100) / 100,
    }))
    .sort((a, b) => b.valorEmAberto - a.valorEmAberto);
}

// Item 156: a soma das parcelas do ciclo atual (excluindo as já renegociadas
// por acordo, que têm outro valor combinado) tem que fechar com capital +
// honorários. Diverge quando alguém mexeu numa parcela avulsa/ajuste sem
// perceber o impacto no total, ou algum bug futuro na geração.
// Não compara contra o % de honorários atual porque ele pode ter mudado desde
// que o contrato foi fechado (contratos antigos usaram o % da época) — isso
// geraria alarme falso em massa. Em vez disso, checa duas coisas que nunca
// deveriam acontecer em NENHUM contrato, seja qual for o %: faltar/sobrar
// parcela do plano original, ou a soma cobrada ficar abaixo do capital
// emprestado (prejuízo embutido no próprio cadastro).
export async function parcelasSomaDivergente() {
  const contatos = await prisma.contact.findMany({
    where: { excluidoEm: null, valorCapital: { not: null } },
    select: {
      id: true,
      name: true,
      phone: true,
      valorCapital: true,
      cicloAtual: true,
      parcelas: { select: { amount: true, number: true, ciclo: true, renegociada: true, deAcordo: true } },
    },
  });

  const divergentes = [];
  for (const c of contatos) {
    const ciclo = c.cicloAtual || 1;
    const doPlanoOriginal = c.parcelas.filter(
      (p) => (p.ciclo || 1) === ciclo && !p.renegociada && !p.deAcordo && p.number <= NUM_PARCELAS
    );
    if (doPlanoOriginal.length === 0) continue; // ciclo todo renegociado por acordo — nada a comparar
    const somaReal = Math.round(doPlanoOriginal.reduce((s, p) => s + p.amount, 0) * 100) / 100;
    const motivos = [];
    if (doPlanoOriginal.length !== NUM_PARCELAS) {
      motivos.push(`${doPlanoOriginal.length} parcela(s) em vez de ${NUM_PARCELAS}`);
    }
    if (somaReal < c.valorCapital) {
      motivos.push(`soma (R$ ${somaReal}) menor que o capital emprestado (R$ ${c.valorCapital})`);
    }
    if (motivos.length > 0) {
      divergentes.push({
        contactId: c.id,
        nome: c.name,
        phone: c.phone,
        somaParcelas: somaReal,
        valorCapital: c.valorCapital,
        qtdParcelas: doPlanoOriginal.length,
        motivo: motivos.join("; "),
      });
    }
  }
  return divergentes;
}

// Item 157: toda baixa em DINHEIRO devia criar um EspecieMovimento (pra
// rastrear até o depósito) — a criação hoje é "best effort" (não trava a
// baixa se falhar), então essa auditoria pega quando isso silenciosamente
// não aconteceu e o dinheiro passou sem deixar rastro.
export async function baixasSemEspecieMovimento() {
  const baixas = await prisma.parcela.findMany({
    where: { paid: true, formaPagamento: "dinheiro" },
    select: { id: true, number: true, amountPago: true, amount: true, paidAt: true, baixadoPor: true, contact: { select: { id: true, name: true } } },
  });
  if (baixas.length === 0) return [];
  const movimentos = await prisma.especieMovimento.findMany({
    where: { parcelaId: { in: baixas.map((b) => b.id) }, tipo: "recebido" },
    select: { parcelaId: true },
  });
  const comMovimento = new Set(movimentos.map((m) => m.parcelaId));
  return baixas
    .filter((b) => !comMovimento.has(b.id))
    .map((b) => ({
      parcelaId: b.id,
      contactId: b.contact?.id,
      nome: b.contact?.name,
      parcela: b.number,
      valor: b.amountPago ?? b.amount,
      paidAt: b.paidAt,
      baixadoPor: b.baixadoPor,
    }))
    .sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt));
}

export async function relatorioIntegridade() {
  const [orfas, somaDivergente, semEspecie] = await Promise.all([
    parcelasOrfas(),
    parcelasSomaDivergente(),
    baixasSemEspecieMovimento(),
  ]);
  return { orfas, somaDivergente, semEspecie };
}
