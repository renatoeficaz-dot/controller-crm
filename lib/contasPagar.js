import { prisma } from "@/lib/prisma";

// Quantos meses à frente uma conta recorrente ILIMITADA fica materializada.
// Gerar linhas infinitas não é possível; a janela é renovada pelo job diário.
const JANELA_ILIMITADA = 12;

// Soma meses preservando o "dia do vencimento" quando o mês seguinte é mais
// curto: uma conta que vence dia 31 cai no dia 28/29 em fevereiro, e não
// transborda pro dia 3 de março (que é o que Date faz sozinho).
export function somarMeses(data, meses) {
  const d = new Date(data);
  const dia = d.getUTCDate();
  const alvo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + meses, 1));
  const ultimoDiaDoMes = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(dia, ultimoDiaDoMes));
  return alvo;
}

// Cria a conta e, se for recorrente, também as ocorrências seguintes.
// - recorrenciaMeses = N  -> gera N ocorrências no total (a primeira + N-1)
// - recorrenciaMeses = null (e recorrente) -> ilimitada: materializa 12 meses
export async function criarContaPagar(dados) {
  const base = {
    descricao: dados.descricao,
    valor: dados.valor,
    categoriaId: dados.categoriaId || null,
    bancoId: dados.bancoId || null,
    observacao: dados.observacao || null,
  };

  const mae = await prisma.contaPagar.create({
    data: {
      ...base,
      vencimento: dados.vencimento,
      recorrente: !!dados.recorrente,
      recorrenciaMeses: dados.recorrente ? dados.recorrenciaMeses ?? null : null,
    },
  });

  if (!dados.recorrente) return mae;

  const total = dados.recorrenciaMeses ?? JANELA_ILIMITADA;
  const filhas = [];
  for (let i = 1; i < total; i++) {
    filhas.push({
      ...base,
      vencimento: somarMeses(dados.vencimento, i),
      recorrente: false, // só a mãe guarda a regra
      origemId: mae.id,
    });
  }
  if (filhas.length) await prisma.contaPagar.createMany({ data: filhas });

  return mae;
}

// Mantém as recorrentes ilimitadas sempre com ~12 meses à frente. Roda 1x/dia.
export async function estenderRecorrenciasIlimitadas() {
  const maes = await prisma.contaPagar.findMany({
    where: { recorrente: true, recorrenciaMeses: null },
    include: { ocorrencias: { orderBy: { vencimento: "desc" }, take: 1 } },
  });

  const limite = somarMeses(new Date(), JANELA_ILIMITADA);
  let criadas = 0;

  for (const mae of maes) {
    let ultimo = mae.ocorrencias[0]?.vencimento || mae.vencimento;
    const novas = [];
    while (somarMeses(ultimo, 1) <= limite) {
      ultimo = somarMeses(ultimo, 1);
      novas.push({
        descricao: mae.descricao,
        valor: mae.valor,
        vencimento: ultimo,
        categoriaId: mae.categoriaId,
        bancoId: mae.bancoId,
        observacao: mae.observacao,
        origemId: mae.id,
      });
    }
    if (novas.length) {
      await prisma.contaPagar.createMany({ data: novas });
      criadas += novas.length;
    }
  }
  return criadas;
}

// Marcar como paga gera o Lancamento de saída — é aí que o saldo muda. Antes
// disso a conta é só uma previsão e não deve afetar o caixa.
export async function pagarConta(id, { valorPago, data, bancoId } = {}) {
  const conta = await prisma.contaPagar.findUnique({ where: { id } });
  if (!conta) return null;
  if (conta.pago) return conta;

  const valor = valorPago != null && valorPago !== "" ? Number(valorPago) : conta.valor;
  const quando = data ? new Date(data) : new Date();

  const lanc = await prisma.lancamento.create({
    data: {
      type: "saida",
      amount: valor,
      description: conta.descricao,
      date: quando,
      categoriaId: conta.categoriaId,
      bancoId: bancoId || conta.bancoId,
    },
  });

  return prisma.contaPagar.update({
    where: { id },
    data: { pago: true, pagoEm: quando, valor, lancamentoId: lanc.id, bancoId: bancoId || conta.bancoId },
  });
}

// Estornar remove o lançamento junto — senão o saldo ficaria errado.
export async function estornarConta(id) {
  const conta = await prisma.contaPagar.findUnique({ where: { id } });
  if (!conta?.pago) return conta;
  if (conta.lancamentoId) {
    await prisma.lancamento.delete({ where: { id: conta.lancamentoId } }).catch(() => {});
  }
  return prisma.contaPagar.update({
    where: { id },
    data: { pago: false, pagoEm: null, lancamentoId: null },
  });
}
