import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// CAC por etiqueta no período: custo = (custo por lead da etiqueta) × (leads criados no período com a etiqueta);
// venda = lead da etiqueta que entrou em Recebimento no período (mesma regra de venda das Metas).
// CAC = custo ÷ vendas. Datas "YYYY-MM-DD" no fuso de Brasília.
const diaValido = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "");

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const ini = searchParams.get("ini");
  const fim = searchParams.get("fim");
  if (!diaValido(ini) || !diaValido(fim)) return NextResponse.json({ error: "Informe ini e fim (AAAA-MM-DD)." }, { status: 400 });
  const de = new Date(`${ini}T00:00:00-03:00`);
  const ate = new Date(new Date(`${fim}T00:00:00-03:00`).getTime() + 86400e3);
  if (isNaN(de) || isNaN(ate) || ate <= de) return NextResponse.json({ error: "Período inválido." }, { status: 400 });
  // Janela de criação dos leads (pode ser outra, quando o filtro usado é o de "Data de criação da lead"). coorte=1: as vendas
  // contadas são só dos leads criados nessa janela (quando o período de vendas é "todo período").
  const leadIni = diaValido(searchParams.get("leadIni")) ? searchParams.get("leadIni") : ini;
  const leadFim = diaValido(searchParams.get("leadFim")) ? searchParams.get("leadFim") : fim;
  const leadDe = new Date(`${leadIni}T00:00:00-03:00`);
  const leadAte = new Date(new Date(`${leadFim}T00:00:00-03:00`).getTime() + 86400e3);
  const coorte = searchParams.get("coorte") === "1";

  const tags = await prisma.tag.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, color: true, custoPorLead: true } });
  const linhas = [];
  for (const t of tags) {
    const baseLeads = { excluidoEm: null, createdAt: { gte: leadDe, lt: leadAte }, tags: { some: { id: t.id } } };
    // Quantos dos leads da etiqueta já passaram por cada etapa do funil (qualquer momento, pelo histórico de etapas).
    const passou = (etapa) => prisma.contact.count({ where: { ...baseLeads, etapaLogs: { some: { paraEtapa: etapa } } } });
    const [leads, docs, analise, video, vendas] = await Promise.all([
      prisma.contact.count({ where: baseLeads }),
      passou("Documentação"),
      passou("Análise"),
      passou("Vídeo chamada"),
      prisma.contact.count({
        where: { excluidoEm: null, valorCapital: { gt: 0 }, entrouRecebimentoEm: { gte: de, lt: ate }, ...(coorte ? { createdAt: { gte: leadDe, lt: leadAte } } : {}), stage: { name: { not: "Venda perdida" } }, tags: { some: { id: t.id } } },
      }),
    ]);
    const cpl = t.custoPorLead ?? null;
    const custo = cpl != null ? cpl * leads : null;
    linhas.push({ id: t.id, nome: t.name, cor: t.color, custoPorLead: cpl, leads, docs, analise, video, custo, vendas, cac: custo != null && vendas > 0 ? custo / vendas : null, conversao: leads > 0 ? vendas / leads : null });
  }
  const comCusto = linhas.filter((l) => l.custo != null);
  const custoTotal = comCusto.reduce((s, l) => s + l.custo, 0);
  const vendasComCusto = comCusto.reduce((s, l) => s + l.vendas, 0);
  return NextResponse.json({ linhas, total: { custo: custoTotal, vendas: vendasComCusto, cac: vendasComCusto > 0 ? custoTotal / vendasComCusto : null } });
}
