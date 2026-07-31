import { prisma } from "@/lib/prisma";
import { hojeStr } from "@/lib/finance";

const diaLocal = (d) => new Date(d).toLocaleDateString("en-CA");
const diaVencimento = (d) => new Date(d).toISOString().slice(0, 10); // dueDate é meia-noite UTC representando o dia

function somarDias(dia, n) {
  const d = new Date(dia + "T00:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Projeção de caixa pros próximos `dias` dias: entrada esperada (parcelas em
// aberto vencendo naquele dia) menos saída esperada (contas a pagar em aberto
// vencendo naquele dia), partindo do saldo real de hoje.
//
// É PREVISÃO, não garantia — parcela vencendo não significa que vai ser paga
// (por isso o valor "otimista" existe ao lado do "realista", que aplica a
// taxa histórica real de recebimento no prazo).
export async function projecaoFluxoCaixa(dias = 30) {
  const hoje = hojeStr();
  const fim = somarDias(hoje, dias);

  const [entradasReais, saidasReais, parcelas, contasPagar, historico] = await Promise.all([
    prisma.lancamento.aggregate({ _sum: { amount: true }, where: { type: "entrada" } }),
    prisma.lancamento.aggregate({ _sum: { amount: true }, where: { type: "saida" } }),
    prisma.parcela.findMany({
      where: { paid: false, dueDate: { gte: new Date(hoje + "T00:00:00.000Z"), lt: new Date(fim + "T00:00:00.000Z") } },
      select: { amount: true, dueDate: true },
    }),
    prisma.contaPagar.findMany({
      where: { pago: false, vencimento: { gte: new Date(hoje + "T00:00:00.000Z"), lt: new Date(fim + "T00:00:00.000Z") } },
      select: { valor: true, vencimento: true },
    }),
    // Taxa histórica de "pago dentro de 3 dias do vencimento" — usada só pra
    // dar um número realista ao lado do otimista, não altera o otimista.
    prisma.parcela.findMany({
      where: { paid: true, paidAt: { not: null } },
      select: { paidAt: true, dueDate: true },
      take: 500,
      orderBy: { paidAt: "desc" },
    }),
  ]);
  const saldoAtual = (entradasReais._sum.amount || 0) - (saidasReais._sum.amount || 0);

  const pagasNoPrazo = historico.filter((p) => {
    const atraso = (new Date(diaLocal(p.paidAt)) - new Date(diaVencimento(p.dueDate))) / 86400000;
    return atraso <= 3;
  }).length;
  const taxaRealista = historico.length ? pagasNoPrazo / historico.length : 0.7;

  const porDia = new Map();
  const garante = (dia) => {
    if (!porDia.has(dia)) porDia.set(dia, { dia, entradaEsperada: 0, saidaEsperada: 0 });
    return porDia.get(dia);
  };
  let d = hoje;
  while (d < fim) { garante(d); d = somarDias(d, 1); }

  for (const p of parcelas) {
    garante(diaVencimento(p.dueDate)).entradaEsperada += p.amount;
  }
  for (const c of contasPagar) {
    garante(diaVencimento(c.vencimento)).saidaEsperada += c.valor;
  }

  let acumuladoOtimista = saldoAtual;
  let acumuladoRealista = saldoAtual;
  const serie = [...porDia.values()].sort((a, b) => a.dia.localeCompare(b.dia)).map((r) => {
    acumuladoOtimista += r.entradaEsperada - r.saidaEsperada;
    acumuladoRealista += r.entradaEsperada * taxaRealista - r.saidaEsperada;
    return {
      dia: r.dia,
      entradaEsperada: Math.round(r.entradaEsperada * 100) / 100,
      saidaEsperada: Math.round(r.saidaEsperada * 100) / 100,
      saldoOtimista: Math.round(acumuladoOtimista * 100) / 100,
      saldoRealista: Math.round(acumuladoRealista * 100) / 100,
    };
  });

  const primeiroNegativo = serie.find((r) => r.saldoRealista < 0);

  return {
    saldoAtual: Math.round(saldoAtual * 100) / 100,
    taxaRealista: Math.round(taxaRealista * 100),
    serie,
    diaFicaNegativo: primeiroNegativo?.dia || null,
  };
}
