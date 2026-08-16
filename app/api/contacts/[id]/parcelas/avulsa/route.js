import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { registrarAuditoria } from "@/lib/auditoria";
import { getSession } from "@/lib/session";
import { negarSeNaoPodeVerContato } from "@/lib/contatoAcesso";

// Adiciona uma parcela AVULSA (item 105) — taxa extra, multa acordada à parte,
// etc. Não mexe no plano original de 10; só soma mais uma linha na lista.
export async function POST(req, { params }) {
  const { id } = await params;
  const negado = await negarSeNaoPodeVerContato(id);
  if (negado) return negado;
  const { valor, vencimento, descricao } = await req.json().catch(() => ({})) ?? {};
  if (!valor || Number(valor) <= 0) return NextResponse.json({ error: "Valor inválido." }, { status: 400 });
  if (!vencimento) return NextResponse.json({ error: "Informe o vencimento." }, { status: 400 });

  const contact = await prisma.contact.findUnique({ where: { id }, select: { name: true, cicloAtual: true } });
  if (!contact) return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });

  const ultima = await prisma.parcela.findFirst({ where: { contactId: id }, orderBy: { number: "desc" } });
  const numero = (ultima?.number || 0) + 1;

  const parcela = await prisma.parcela.create({
    data: {
      contactId: id,
      number: numero,
      dueDate: new Date(vencimento + "T00:00:00.000Z"),
      amount: Number(valor),
      ciclo: contact.cicloAtual || 1,
      deAcordo: true, // reaproveita o flag "fora do plano original de 10"
    },
  });

  const session = await getSession();
  registrarAuditoria({
    usuario: session?.name,
    acao: "criar_parcela_avulsa",
    entidade: "Parcela",
    entidadeId: parcela.id,
    detalhe: `${contact.name} — parcela avulsa ${numero}ª de R$ ${valor}${descricao ? `: ${descricao}` : ""}`,
  });

  return NextResponse.json(parcela);
}
