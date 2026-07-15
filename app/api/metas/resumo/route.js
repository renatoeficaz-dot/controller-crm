import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

function inicioDiaUTC(offsetDias = 0) {
  const hoje = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD local
  const d = new Date(hoje + "T00:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + offsetDias);
  return d;
}

// Resumo do dia pra aba Metas: vendas (leads que caíram em Recebimento) hoje
// e ontem, recebimentos (baixas de parcela) hoje, e a meta calculada a partir
// da configuração ("a cada X vendas, precisa de Y recebimentos no dia seguinte").
export async function GET() {
  const inicioHoje = inicioDiaUTC(0);
  const inicioAmanha = inicioDiaUTC(1);
  const inicioOntem = inicioDiaUTC(-1);

  const [cfg, vendasHoje, vendasOntem, recebimentosHoje, valorRecebidoHoje] = await Promise.all([
    prisma.config.findUnique({ where: { id: "singleton" } }),
    prisma.contact.count({ where: { pagamentoCapital: { gte: inicioHoje, lt: inicioAmanha } } }),
    prisma.contact.count({ where: { pagamentoCapital: { gte: inicioOntem, lt: inicioHoje } } }),
    prisma.parcela.count({ where: { paid: true, paidAt: { gte: inicioHoje, lt: inicioAmanha } } }),
    prisma.parcela.aggregate({
      where: { paid: true, paidAt: { gte: inicioHoje, lt: inicioAmanha } },
      _sum: { amountPago: true },
    }),
  ]);

  const vendasBase = Math.max(1, cfg?.metaVendasBase ?? 1);
  const recebimentosBase = Math.max(0, cfg?.metaRecebimentosBase ?? 1);
  const metaRecebimentosHoje = Math.ceil((vendasOntem * recebimentosBase) / vendasBase);

  return NextResponse.json({
    vendasHoje,
    vendasOntem,
    recebimentosHoje,
    valorRecebidoHoje: valorRecebidoHoje._sum.amountPago || 0,
    metaRecebimentosHoje,
    metaVendasBase: vendasBase,
    metaRecebimentosBase: recebimentosBase,
  });
}
