import { prisma } from "@/lib/prisma";

// Tempo médio que os leads ficam em cada etapa (item 129) — calculado do
// histórico real de mudanças (EtapaLog), não de uma foto do funil de agora.
// Pra cada entrada numa etapa, a saída é a PRÓXIMA mudança do mesmo lead (ou
// "ainda não saiu", que não entra na média — só afeta quem já passou).
export async function tempoMedioPorEtapa() {
  const logs = await prisma.etapaLog.findMany({
    orderBy: [{ contactId: "asc" }, { createdAt: "asc" }],
    select: { contactId: true, paraEtapa: true, createdAt: true },
  });

  const somaPorEtapa = new Map(); // etapa -> { somaDias, n }
  const add = (etapa, dias) => {
    if (!somaPorEtapa.has(etapa)) somaPorEtapa.set(etapa, { somaDias: 0, n: 0 });
    const r = somaPorEtapa.get(etapa);
    r.somaDias += dias;
    r.n += 1;
  };

  let porContato = new Map();
  for (const l of logs) {
    if (!porContato.has(l.contactId)) porContato.set(l.contactId, []);
    porContato.get(l.contactId).push(l);
  }

  for (const eventos of porContato.values()) {
    for (let i = 0; i < eventos.length - 1; i++) {
      const dias = (new Date(eventos[i + 1].createdAt) - new Date(eventos[i].createdAt)) / 86400000;
      add(eventos[i].paraEtapa, dias);
    }
  }

  return [...somaPorEtapa.entries()]
    .map(([etapa, r]) => ({ etapa, diasMedios: Math.round((r.somaDias / r.n) * 10) / 10, amostras: r.n }))
    .sort((a, b) => b.diasMedios - a.diasMedios);
}
