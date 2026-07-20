import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

function inicioDiaUTC(offsetDias = 0) {
  const hoje = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD local
  const d = new Date(hoje + "T00:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + offsetDias);
  return d;
}

// Resumo do dia pra aba Metas:
// - Vendas: meta fixa configurável de quantos leads devem cair em "Recebimento" no dia.
// - Recebimentos: meta é X% de todos os leads atualmente em "Recebimento" pagando hoje.
export async function GET() {
  const inicioHoje = inicioDiaUTC(0);
  const inicioAmanha = inicioDiaUTC(1);

  const [cfg, stageRecebimento, valorRecebidoHoje, pagantesHoje, baixasHoje, vendasHoje, baixasDetalhe] = await Promise.all([
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
    // Total de parcelas baixadas hoje (não distinto por cliente) — um cliente
    // que quita 2 dias de atraso de uma vez conta como 2 baixas aqui, mas só
    // 1 em "pagantesHoje" (a meta é sobre % de CLIENTES que pagaram, não de
    // parcelas — ficavam parecendo números "errados" um contra o outro).
    prisma.parcela.count({
      where: { paid: true, paidAt: { gte: inicioHoje, lt: inicioAmanha } },
    }),
    prisma.contact.count({ where: { entrouRecebimentoEm: { gte: inicioHoje, lt: inicioAmanha } } }),
    // Lista de cada baixa de hoje (uma linha por parcela paga) — pra mostrar
    // quem pagou e dar pra abrir o lead direto da tela de Metas.
    prisma.parcela.findMany({
      where: { paid: true, paidAt: { gte: inicioHoje, lt: inicioAmanha } },
      orderBy: { paidAt: "desc" },
      select: {
        id: true,
        number: true,
        amountPago: true,
        paidAt: true,
        contact: { select: { id: true, name: true, phone: true } },
      },
    }),
  ]);

  const totalEmRecebimento = stageRecebimento
    ? await prisma.contact.count({ where: { stageId: stageRecebimento.id } })
    : 0;

  const clamp = (v) => Math.min(100, Math.max(0, v));
  const pctMinima = clamp(cfg?.metaPctRecebimentoMinima ?? 40);
  const pctMedia = clamp(cfg?.metaPctRecebimentoMedia ?? 55);
  const pct = clamp(cfg?.metaPctRecebimento ?? 70);
  const metaRecebimentosMinima = Math.ceil((totalEmRecebimento * pctMinima) / 100);
  const metaRecebimentosMedia = Math.ceil((totalEmRecebimento * pctMedia) / 100);
  const metaRecebimentosHoje = Math.ceil((totalEmRecebimento * pct) / 100);
  const recebimentosHoje = pagantesHoje.length;

  const metaVendasMinima = cfg?.metaVendasMinima ?? 2;
  const metaVendasMedia = cfg?.metaVendasMedia ?? 3;
  const metaVendasDia = cfg?.metaVendasDia ?? 5;

  return NextResponse.json({
    vendasHoje,
    metaVendasMinima,
    metaVendasMedia,
    metaVendasDia,
    totalEmRecebimento,
    recebimentosHoje,
    baixasHoje,
    baixasDetalhe: baixasDetalhe.map((p) => ({
      id: p.id,
      contactId: p.contact.id,
      nome: p.contact.name,
      phone: p.contact.phone,
      parcela: p.number,
      valor: p.amountPago,
      paidAt: p.paidAt,
    })),
    valorRecebidoHoje: valorRecebidoHoje._sum.amountPago || 0,
    metaRecebimentosMinima,
    metaRecebimentosMedia,
    metaRecebimentosHoje,
    metaPctRecebimentoMinima: pctMinima,
    metaPctRecebimentoMedia: pctMedia,
    metaPctRecebimento: pct,
  });
}
