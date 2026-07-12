import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const ORDER_MAP = {
  recentes: { date: "desc" },
  antigos: { date: "asc" },
  maior_valor: { amount: "desc" },
  menor_valor: { amount: "asc" },
};

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const categoriaId = searchParams.get("categoriaId");
  const bancoId = searchParams.get("bancoId");
  const ini = searchParams.get("ini");
  const fim = searchParams.get("fim");
  const responsavel = searchParams.get("responsavel");
  const tagId = searchParams.get("tagId");
  const valorMin = searchParams.get("valorMin");
  const valorMax = searchParams.get("valorMax");
  const order = ORDER_MAP[searchParams.get("sort")] || ORDER_MAP.recentes;

  const where = {};
  if (type) where.type = type;
  if (categoriaId) where.categoriaId = categoriaId;
  if (bancoId) where.bancoId = bancoId;
  if (ini || fim) {
    where.date = {};
    if (ini) where.date.gte = new Date(ini + "T00:00:00Z");
    if (fim) where.date.lte = new Date(fim + "T23:59:59Z");
  }
  if (responsavel) where.contact = { responsavel };
  if (tagId) where.contact = { ...(where.contact || {}), tags: { some: { id: tagId } } };
  if (valorMin || valorMax) {
    where.amount = {};
    if (valorMin) where.amount.gte = Number(valorMin);
    if (valorMax) where.amount.lte = Number(valorMax);
  }

  const lancamentos = await prisma.lancamento.findMany({
    where,
    orderBy: order,
    include: {
      categoria: { select: { id: true, name: true, type: true } },
      banco: { select: { id: true, name: true } },
      contact: { select: { id: true, name: true, responsavel: true } },
    },
    take: 500,
  });
  return NextResponse.json(lancamentos);
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const type = body.type;
  const amount = Number(body.amount);
  if (!["entrada", "saida"].includes(type) || !amount || amount <= 0) {
    return NextResponse.json({ error: "Tipo (entrada/saida) e valor positivo obrigatórios." }, { status: 400 });
  }
  const lanc = await prisma.lancamento.create({
    data: {
      type,
      amount,
      description: (body.description || "").trim() || null,
      date: body.date ? new Date(body.date) : new Date(),
      categoriaId: body.categoriaId || null,
      bancoId: body.bancoId || null,
      contactId: body.contactId || null,
    },
    include: {
      categoria: { select: { id: true, name: true, type: true } },
      banco: { select: { id: true, name: true } },
      contact: { select: { id: true, name: true, responsavel: true } },
    },
  });
  return NextResponse.json(lanc);
}
