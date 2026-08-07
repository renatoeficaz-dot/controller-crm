import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { criarAcordoParcelado } from "@/lib/acordo";
import { registrarAuditoria } from "@/lib/auditoria";
import { negarSeNaoPodeVerContato } from "@/lib/contatoAcesso";

// Histórico de negociações do lead — o que já foi oferecido e o que ele aceitou
// ou recusou. Evita oferecer o mesmo desconto duas vezes pra quem já ignorou.
export async function GET(_req, { params }) {
  const { id } = await params;
  const negado = await negarSeNaoPodeVerContato(id);
  if (negado) return negado;
  const negociacoes = await prisma.negociacao.findMany({
    where: { contactId: id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(negociacoes);
}

// Registra uma negociação. tipo = "acordo_parcelado" também cria as parcelas
// novas e aposenta as em aberto; os outros tipos são só registro histórico.
export async function POST(req, { params }) {
  const { id } = await params;
  const negado = await negarSeNaoPodeVerContato(id);
  if (negado) return negado;
  const body = await req.json().catch(() => ({}));
  const session = await getSession();

  if (body.tipo === "acordo_parcelado") {
    const r = await criarAcordoParcelado({
      contactId: id,
      valorTotal: body.valorTotal,
      parcelas: body.parcelas,
      primeiroVencimento: body.primeiroVencimento,
      intervaloDias: body.intervaloDias,
      usuario: session?.name,
      notas: body.notas,
    });
    if (r.error) return NextResponse.json({ error: r.error }, { status: r.status || 400 });
    registrarAuditoria({
      usuario: session?.name,
      acao: "acordo_parcelado",
      entidade: "Contact",
      entidadeId: id,
      detalhe: `Acordo de R$ ${r.valorNegociado} em ${r.parcelas}x (original em aberto: R$ ${r.valorOriginal})`,
    });
    return NextResponse.json(r);
  }

  const tiposValidos = ["desconto_aceito", "desconto_recusado", "outro"];
  if (!tiposValidos.includes(body.tipo)) {
    return NextResponse.json({ error: "Tipo de negociação inválido." }, { status: 400 });
  }

  const neg = await prisma.negociacao.create({
    data: {
      contactId: id,
      tipo: body.tipo,
      valorOriginal: body.valorOriginal != null ? Number(body.valorOriginal) : null,
      valorNegociado: body.valorNegociado != null ? Number(body.valorNegociado) : null,
      aceito: body.tipo === "desconto_aceito",
      notas: (body.notas || "").trim() || null,
      usuario: session?.name || null,
    },
  });
  return NextResponse.json(neg);
}
