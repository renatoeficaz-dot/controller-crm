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

  const where = { stageId: { in: stages.map((s) => s.id) }, excluidoEm: null };
  if (!veTodosLeads(user)) where.responsavel = user?.name || "__none__";

  const inicioHoje = new Date(hoje + "T00:00:00.000Z");
  const regras = await prisma.regraCobranca.findMany({ where: { canalSugerido: { not: null } } });
  const canalPara = (dias) => regras.find((r) => dias >= r.diasMin && (r.diasMax == null || dias <= r.diasMax))?.canalSugerido || null;

  const contatos = await prisma.contact.findMany({
    where,
    include: {
      parcelas: { orderBy: { number: "asc" } },
      tentativas: { orderBy: { createdAt: "desc" }, select: { id: true, resultado: true, dataPromessa: true, createdAt: true } },
    },
  });

  const fila = [];
  for (const c of contatos) {
    const atrasadas = (c.parcelas || []).filter((p) => parcelaAtrasada(p, hoje));
    if (!atrasadas.length) continue;

    const abertas = (c.parcelas || []).filter((p) => !p.paid && !p.renegociada);
    const valorAberto = abertas.reduce((acc, p) => acc + p.amount, 0);
    const maisAntiga = atrasadas.slice().sort((a, b) => dueStr(a).localeCompare(dueStr(b)))[0];
    const dias = Math.round((new Date(hoje) - new Date(dueStr(maisAntiga))) / 86400000);
    const stage = stages.find((s) => s.id === c.stageId);
    const tentativasHoje = c.tentativas.filter((t) => new Date(t.createdAt) >= inicioHoje).length;

    // Promessa quebrada: prometeu pagar até uma data que já passou e a parcela
    // mais antiga continua aberta. Só conta a promessa mais recente — uma
    // promessa nova substitui a anterior.
    const ultimaPromessa = c.tentativas.find((t) => t.resultado === "prometeu" && t.dataPromessa);
    const promessaQuebrada =
      !!ultimaPromessa && dueStr({ dueDate: ultimaPromessa.dataPromessa }) < hoje;

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
      tentativasHoje,
      canalSugerido: canalPara(dias),
      promessaQuebrada,
      dataPromessa: ultimaPromessa?.dataPromessa || null,
      // Quem prometeu e não cumpriu vai pro topo: já houve contato e
      // compromisso, então é o caso mais quente da fila.
      prioridade: Math.round(valorAberto * pesoAtraso(dias)) * (promessaQuebrada ? 10 : 1),
    });
  }

  fila.sort((a, b) => b.prioridade - a.prioridade);
  return NextResponse.json(fila);
}
