import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser, veTodosLeads } from "@/lib/session";
import { hojeStr, dueStr, parcelaAtrasada } from "@/lib/finance";

// Quem cobrar hoje: clientes em Recebimento/Cravo com parcela vencida em aberto.
// A ordem é por prioridade = valor em aberto x peso do atraso — quem atrasou
// pouco tem mais chance de pagar, então vale abordar antes de virar caso perdido.
function pesoAtraso(dias) {
  if (dias <= 7) return 3;
  if (dias <= 15) return 2;
  return 1;
}

export async function GET() {
  const user = await getCurrentUser();
  const hoje = hojeStr();

  const stages = await prisma.stage.findMany({
    where: { name: { in: ["Recebimento", "Cravo"] } },
    select: { id: true, name: true },
  });
  if (!stages.length) return NextResponse.json([]);

  const where = { stageId: { in: stages.map((s) => s.id) } };
  if (!veTodosLeads(user)) where.responsavel = user?.name || "__none__";

  const inicioHoje = new Date(hoje + "T00:00:00.000Z");
  const contatos = await prisma.contact.findMany({
    where,
    include: {
      parcelas: { orderBy: { number: "asc" } },
      tentativas: { where: { createdAt: { gte: inicioHoje } }, select: { id: true } },
    },
  });

  const fila = [];
  for (const c of contatos) {
    const atrasadas = (c.parcelas || []).filter((p) => parcelaAtrasada(p, hoje));
    if (!atrasadas.length) continue;

    const abertas = (c.parcelas || []).filter((p) => !p.paid);
    const valorAberto = abertas.reduce((acc, p) => acc + p.amount, 0);
    const maisAntiga = atrasadas.slice().sort((a, b) => dueStr(a).localeCompare(dueStr(b)))[0];
    const dias = Math.round((new Date(hoje) - new Date(dueStr(maisAntiga))) / 86400000);
    const stage = stages.find((s) => s.id === c.stageId);

    fila.push({
      id: c.id,
      name: c.name,
      phone: c.phone,
      responsavel: c.responsavel,
      etapa: stage?.name || "",
      diasAtraso: dias,
      valorAberto,
      parcelasAtrasadas: atrasadas.length,
      proximaParcelaId: maisAntiga.id,
      proximaParcelaNumero: maisAntiga.number,
      proximaParcelaValor: maisAntiga.amount,
      tentativasHoje: c.tentativas.length,
      prioridade: Math.round(valorAberto * pesoAtraso(dias)),
    });
  }

  fila.sort((a, b) => b.prioridade - a.prioridade);
  return NextResponse.json(fila);
}
