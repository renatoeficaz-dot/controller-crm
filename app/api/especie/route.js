import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { lerCorpo } from "@/lib/corpo";

// Saldo em espécie em mãos de cada cobrador: soma(recebido) - soma(depositado).
// Admin vê todo mundo; cobrador só o próprio.
export async function GET(req) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const pedido = new URL(req.url).searchParams.get("usuario");
  const usuario = isAdmin(user) ? pedido : user.name;

  const where = usuario ? { usuario } : {};
  const [movs] = await Promise.all([
    prisma.especieMovimento.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 }),
  ]);

  const porUsuario = new Map();
  for (const m of movs) {
    const acc = porUsuario.get(m.usuario) || { usuario: m.usuario, recebido: 0, depositado: 0 };
    if (m.tipo === "recebido") acc.recebido += m.valor;
    else acc.depositado += m.valor;
    porUsuario.set(m.usuario, acc);
  }

  const saldos = [...porUsuario.values()].map((r) => ({ ...r, saldo: Math.round((r.recebido - r.depositado) * 100) / 100 }));
  return NextResponse.json({ movimentos: movs, saldos });
}

// Registra um depósito manual (o "recebido" nasce sozinho quando uma baixa é
// dada com formaPagamento = "dinheiro" — ver lib/cobranca.js).
export async function POST(req) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { valor, observacao, usuario: usuarioPedido } = await lerCorpo(req);
  const usuario = isAdmin(user) && usuarioPedido ? usuarioPedido : user.name;
  if (!valor || Number(valor) <= 0) return NextResponse.json({ error: "Valor inválido." }, { status: 400 });

  const mov = await prisma.especieMovimento.create({
    data: { usuario, tipo: "depositado", valor: Number(valor), observacao: observacao || null },
  });
  return NextResponse.json(mov);
}
