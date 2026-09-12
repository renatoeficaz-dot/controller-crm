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
  const corte = new Date(data + "T23:59:59.999Z");

  const [contatos, logs] = await Promise.all([
    prisma.contact.findMany({ where: { valorCapital: { gt: 0 } }, select: { id: true, valorCapital: true } }),
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
    if (etapaNaData.get(c.id) === "Recebimento") capitalEmRecebimento += c.valorCapital;
  }

  return NextResponse.json({ capitalEmRecebimento });
}
