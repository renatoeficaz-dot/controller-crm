import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Linha do tempo unificada (item 66): mudanças de etapa, baixas, tentativas de
// contato e negociações, tudo intercalado por data — os eventos de NEGÓCIO,
// não as mensagens do chat (essas já têm sua própria tela, o Chat).
export async function GET(_req, { params }) {
  const { id } = await params;

  const [etapas, parcelasPagas, tentativas, negociacoes, documentos, responsaveis] = await Promise.all([
    prisma.etapaLog.findMany({ where: { contactId: id }, orderBy: { createdAt: "desc" } }),
    prisma.parcela.findMany({ where: { contactId: id, paid: true }, orderBy: { paidAt: "desc" } }),
    prisma.tentativaContato.findMany({ where: { contactId: id }, orderBy: { createdAt: "desc" } }),
    prisma.negociacao.findMany({ where: { contactId: id }, orderBy: { createdAt: "desc" } }),
    prisma.documento.findMany({ where: { contactId: id, conferido: true }, orderBy: { conferidoEm: "desc" } }),
    prisma.responsavelLog.findMany({ where: { contactId: id }, orderBy: { createdAt: "desc" } }),
  ]);

  const eventos = [
    ...etapas.map((e) => ({
      tipo: "etapa", data: e.createdAt, usuario: e.usuario,
      titulo: e.deEtapa ? `Mudou de "${e.deEtapa}" para "${e.paraEtapa}"` : `Entrou em "${e.paraEtapa}"`,
    })),
    ...parcelasPagas.map((p) => ({
      tipo: "baixa", data: p.paidAt, usuario: p.baixadoPor,
      titulo: `Pagou a ${p.number}ª parcela`, valor: p.amountPago ?? p.amount,
    })),
    ...tentativas.map((t) => ({
      tipo: "tentativa", data: t.createdAt, usuario: t.usuario,
      titulo: `Tentativa de contato (${t.tipo}): ${t.resultado}`, notas: t.notas,
    })),
    ...negociacoes.map((n) => ({
      tipo: "negociacao", data: n.createdAt, usuario: n.usuario,
      titulo: n.tipo === "acordo_parcelado" ? `Acordo parcelado em ${n.parcelas}x` : `Negociação: ${n.tipo}`,
      notas: n.notas,
    })),
    ...documentos.map((d) => ({
      tipo: "documento", data: d.conferidoEm, usuario: d.conferidoPor,
      titulo: `Documento conferido: ${d.tipo}`,
    })),
    ...responsaveis.map((r) => ({
      tipo: "responsavel", data: r.createdAt, usuario: r.usuario,
      titulo: r.de ? `Responsável trocou de ${r.de} para ${r.para || "ninguém"}` : `Responsável definido: ${r.para}`,
    })),
  ]
    .filter((e) => e.data)
    .sort((a, b) => new Date(b.data) - new Date(a.data));

  return NextResponse.json(eventos);
}
