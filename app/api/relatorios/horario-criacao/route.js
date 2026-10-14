import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Por hora do dia em que o lead foi criado (fuso de Brasília): quantos leads e a % que chegou a cada etapa do funil
// (Documentação, Análise, Vídeo chamada, Recebimento = venda) e a % que foi para Venda perdida.
// "Chegou" = passou pela etapa em algum momento (histórico de mudança de etapa) ou está nela agora.
const diaValido = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "");
const ETAPAS = ["Documentação", "Análise", "Vídeo chamada", "Recebimento"];

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const ini = searchParams.get("ini");
  const fim = searchParams.get("fim");
  const tagId = searchParams.get("tagId") || "";
  if (!diaValido(ini) || !diaValido(fim)) return NextResponse.json({ error: "Informe ini e fim (AAAA-MM-DD)." }, { status: 400 });
  const de = new Date(`${ini}T00:00:00-03:00`);
  const ate = new Date(new Date(`${fim}T00:00:00-03:00`).getTime() + 86400e3);
  if (isNaN(de) || isNaN(ate) || ate <= de) return NextResponse.json({ error: "Período inválido." }, { status: 400 });

  const where = { excluidoEm: null, createdAt: { gte: de, lt: ate }, ...(tagId ? { tags: { some: { id: tagId } } } : {}) };
  const leads = await prisma.contact.findMany({ where, select: { id: true, createdAt: true, entrouRecebimentoEm: true, stage: { select: { name: true } } } });
  const ids = leads.map((l) => l.id);
  // Etapas pelas quais cada lead passou (em lotes, para não estourar o limite de parâmetros do SQLite).
  const passou = new Map(); // id -> Set(etapas)
  for (let i = 0; i < ids.length; i += 800) {
    const logs = await prisma.etapaLog.findMany({ where: { contactId: { in: ids.slice(i, i + 800) }, paraEtapa: { in: [...ETAPAS, "Venda perdida"] } }, select: { contactId: true, paraEtapa: true } });
    for (const l of logs) {
      if (!passou.has(l.contactId)) passou.set(l.contactId, new Set());
      passou.get(l.contactId).add(l.paraEtapa);
    }
  }
  const horas = Array.from({ length: 24 }, (_, h) => ({ hora: h, leads: 0, docs: 0, analise: 0, video: 0, venda: 0, perdida: 0 }));
  for (const l of leads) {
    const h = new Date(l.createdAt.getTime() - 3 * 3600e3).getUTCHours();
    const set = passou.get(l.id) || new Set();
    const atual = l.stage?.name;
    const linha = horas[h];
    linha.leads++;
    if (set.has("Documentação") || atual === "Documentação") linha.docs++;
    if (set.has("Análise") || atual === "Análise") linha.analise++;
    if (set.has("Vídeo chamada") || atual === "Vídeo chamada") linha.video++;
    if (set.has("Recebimento") || atual === "Recebimento" || l.entrouRecebimentoEm) linha.venda++;
    if (set.has("Venda perdida") || atual === "Venda perdida") linha.perdida++;
  }
  const total = horas.reduce((t, x) => ({ leads: t.leads + x.leads, docs: t.docs + x.docs, analise: t.analise + x.analise, video: t.video + x.video, venda: t.venda + x.venda, perdida: t.perdida + x.perdida }), { leads: 0, docs: 0, analise: 0, video: 0, venda: 0, perdida: 0 });
  return NextResponse.json({ horas, total });
}
