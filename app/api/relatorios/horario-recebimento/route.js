import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Recebimentos por hora do dia (Brasília): quantidade de pagamentos e valor recebido.
// Conta os lançamentos de entrada gerados por baixa de parcela (parcelaId), pela hora em que o pagamento foi registrado.
const diaValido = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "");

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const ini = searchParams.get("ini");
  const fim = searchParams.get("fim");
  if (!diaValido(ini) || !diaValido(fim)) return NextResponse.json({ error: "Informe ini e fim (AAAA-MM-DD)." }, { status: 400 });
  const de = new Date(`${ini}T00:00:00-03:00`);
  const ate = new Date(new Date(`${fim}T00:00:00-03:00`).getTime() + 86400e3);
  if (isNaN(de) || isNaN(ate) || ate <= de) return NextResponse.json({ error: "Período inválido." }, { status: 400 });

  const ls = await prisma.lancamento.findMany({
    where: { type: "entrada", parcelaId: { not: null }, createdAt: { gte: de, lt: ate }, amount: { gt: 0 } },
    select: { amount: true, createdAt: true },
  });
  const horas = Array.from({ length: 24 }, (_, h) => ({ hora: h, qtd: 0, valor: 0 }));
  for (const l of ls) {
    const h = new Date(l.createdAt.getTime() - 3 * 3600e3).getUTCHours();
    horas[h].qtd++;
    horas[h].valor += l.amount;
  }
  for (const x of horas) x.valor = Math.round(x.valor * 100) / 100;
  return NextResponse.json({ horas, total: { qtd: ls.length, valor: Math.round(horas.reduce((s, x) => s + x.valor, 0) * 100) / 100 } });
}
