import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/session";

// ROI do capital (item 35): lucro do período (honorários recebidos) sobre o
// capital médio que esteve emprestado (empatado) no mesmo período —
// anualizado pra comparar com qualquer outro investimento.
export async function GET() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const noventaDiasAtras = new Date();
  noventaDiasAtras.setDate(noventaDiasAtras.getDate() - 90);

  const [liberados, recebido] = await Promise.all([
    prisma.contact.findMany({
      where: { pagamentoCapital: { gte: noventaDiasAtras }, valorCapital: { not: null } },
      select: { valorCapital: true, pagamentoCapital: true },
    }),
    prisma.parcela.aggregate({
      where: { paid: true, paidAt: { gte: noventaDiasAtras } },
      _sum: { amountPago: true },
    }),
  ]);

  const capitalLiberado = liberados.reduce((s, c) => s + (c.valorCapital || 0), 0);
  const valorRecebido = recebido._sum.amountPago || 0;
  // Lucro = o que voltou acima do que saiu (aproximação: recebido - liberado
  // no período; negativo é normal em carteira em crescimento, onde se libera
  // mais rápido do que o ciclo de 10 dias devolve).
  const lucroPeriodo = valorRecebido - capitalLiberado;

  // Capital médio empatado: aproximação pela metade do capital liberado no
  // período (ele fica emprestado por ~10 dias corridos, uma fração dos 90).
  const capitalMedio = capitalLiberado / 2 || 1;

  const roiPeriodoPct = Math.round((lucroPeriodo / capitalMedio) * 1000) / 10;
  const roiAnualizadoPct = Math.round(roiPeriodoPct * (365 / 90) * 10) / 10;

  return NextResponse.json({
    capitalLiberado: Math.round(capitalLiberado * 100) / 100,
    capitalMedio: Math.round(capitalMedio * 100) / 100,
    valorRecebido: Math.round(valorRecebido * 100) / 100,
    lucroPeriodo: Math.round(lucroPeriodo * 100) / 100,
    roiPeriodoPct,
    roiAnualizadoPct,
    janelaDias: 90,
  });
}
