import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Saldo atual real da conta: soma de TODOS os lançamentos já registrados
// (sem filtro de período), diferente do card "Saldo" da listagem que só
// soma o que está sendo exibido (filtrado por data).
export async function GET() {
  const [entradas, saidas] = await Promise.all([
    prisma.lancamento.aggregate({ where: { type: "entrada" }, _sum: { amount: true } }),
    prisma.lancamento.aggregate({ where: { type: "saida" }, _sum: { amount: true } }),
  ]);
  const totalEntradas = entradas._sum.amount || 0;
  const totalSaidas = saidas._sum.amount || 0;
  return NextResponse.json({ saldo: totalEntradas - totalSaidas, totalEntradas, totalSaidas });
}
