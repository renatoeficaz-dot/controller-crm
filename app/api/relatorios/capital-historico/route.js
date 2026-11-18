import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Quanto capital estava em contatos na etapa "Recebimento" NUMA DATA PASSADA —
// reconstrói pelo EtapaLog (histórico de mudança de coluna), pegando a etapa
// mais recente de cada contato até aquela data. Sem isso, o "custo médio
// diário do capital em Recebimento" nos relatórios usava sempre a carteira de
// HOJE mesmo pra períodos passados (ex.: semana passada calculada com o
// tamanho de carteira de hoje, que pode ser bem diferente).
export async function GET(req) {
  const data = new URL(req.url).searchParams.get("data");
  if (!data) return NextResponse.json({ error: "informe ?data=YYYY-MM-DD" }, { status: 400 });
  // Fim do dia em Brasília (o "Z" cortava às 21h e deixava de fora o que mudou de etapa à noite).
  const corte = new Date(String(data).slice(0, 10) + "T23:59:59.999-03:00");
  if (Number.isNaN(corte.getTime())) return NextResponse.json({ error: "informe ?data=YYYY-MM-DD" }, { status: 400 });

  const [contatos, logs] = await Promise.all([
    prisma.contact.findMany({ where: { valorCapital: { gt: 0 }, excluidoEm: null }, select: { id: true, valorCapital: true, createdAt: true, stage: { select: { name: true } } } }), // lead excluído não é carteira
    prisma.etapaLog.findMany({
      where: { createdAt: { lte: corte } },
      orderBy: { createdAt: "desc" },
      select: { contactId: true, paraEtapa: true },
    }),
  ]);

  // A primeira ocorrência de cada contactId (lista já ordenada da mais recente
  // pra mais antiga) é a etapa em que ele estava naquela data de corte.
  const etapaNaData = new Map();
  for (const l of logs) {
    if (!etapaNaData.has(l.contactId)) etapaNaData.set(l.contactId, l.paraEtapa);
  }

  let capitalEmRecebimento = 0;
  for (const c of contatos) {
    // Lead sem nenhuma mudança de etapa registrada até a data (importado, criado direto na etapa): vale a etapa atual, se já existia.
    const etapa = etapaNaData.has(c.id) ? etapaNaData.get(c.id) : new Date(c.createdAt) <= corte ? c.stage?.name : null;
    if (etapa === "Recebimento") capitalEmRecebimento += c.valorCapital;
  }

  return NextResponse.json({ capitalEmRecebimento });
}
