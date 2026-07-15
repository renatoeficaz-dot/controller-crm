import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

function inicioDiaUTC(offsetDias = 0) {
  const hoje = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD local
  const d = new Date(hoje + "T00:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + offsetDias);
  return d;
}

// Resumo do dia pra aba Metas: meta é X% de todos os leads atualmente na
// etapa "Recebimento" pagando (dando baixa numa parcela) hoje.
export async function GET() {
  const inicioHoje = inicioDiaUTC(0);
  const inicioAmanha = inicioDiaUTC(1);

  const [cfg, stageRecebimento, valorRecebidoHoje, pagantesHoje] = await Promise.all([
    prisma.config.findUnique({ where: { id: "singleton" } }),
    prisma.stage.findFirst({ where: { name: "Recebimento" } }),
    prisma.parcela.aggregate({
      where: { paid: true, paidAt: { gte: inicioHoje, lt: inicioAmanha } },
      _sum: { amountPago: true },
    }),
    prisma.parcela.findMany({
      where: { paid: true, paidAt: { gte: inicioHoje, lt: inicioAmanha } },
      select: { contactId: true },
      distinct: ["contactId"],
    }),
  ]);

  const totalEmRecebimento = stageRecebimento
    ? await prisma.contact.count({ where: { stageId: stageRecebimento.id } })
    : 0;

  const pct = Math.min(100, Math.max(0, cfg?.metaPctRecebimento ?? 70));
  const metaRecebimentosHoje = Math.ceil((totalEmRecebimento * pct) / 100);
  const recebimentosHoje = pagantesHoje.length;

  return NextResponse.json({
    totalEmRecebimento,
    recebimentosHoje,
    valorRecebidoHoje: valorRecebidoHoje._sum.amountPago || 0,
    metaRecebimentosHoje,
    metaPctRecebimento: pct,
  });
}
