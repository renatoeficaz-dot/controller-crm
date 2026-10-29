import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { negarSeNaoPodeVerContato } from "@/lib/contatoAcesso";
import { lerCorpo } from "@/lib/corpo";
import { aplicarBaixaParcial } from "@/lib/baixaParcial";

// Baixa PARCIAL (item 93) — a regra está em lib/baixaParcial.js.
export async function POST(req, { params }) {
  const { id } = await params;
  // Aqui a chave é o id da PARCELA, não do contato — sem essa checagem dava
  // pra mexer no dinheiro (dar baixa, mudar vencimento, pedir desconto) de um
  // lead de outra pessoa só trocando o id na URL.
  const _p = await prisma.parcela.findUnique({ where: { id }, select: { contactId: true } });
  if (!_p) return NextResponse.json({ error: "Parcela não encontrada." }, { status: 404 });
  const negado = await negarSeNaoPodeVerContato(_p.contactId);
  if (negado) return negado;
  const { valor, formaPagamento } = await lerCorpo(req);
  const user = await getCurrentUser().catch(() => null);
  const r = await aplicarBaixaParcial({ id, valor, formaPagamento, usuarioNome: user?.name });
  if (r.erro) return NextResponse.json({ error: r.erro }, { status: r.status || 400 });
  return NextResponse.json(r);
}
