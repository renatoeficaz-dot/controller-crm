import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { lerCorpo, texto } from "@/lib/corpo";

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
  // `new Date("qualquer coisa")` não lança: devolve Invalid Date, e o Prisma
  // recusa isso com erro — a rota estourava 500 se ini/fim viessem com algo
  // que não fosse uma data (link editado à mão, filtro salvo antigo).
  // Data inválida é filtro inválido: ignora em vez de derrubar a tela.
  const dataOuNulo = (valor, sufixo) => {
    if (!valor) return null;
    const d = new Date(valor + sufixo);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const dataIni = dataOuNulo(ini, "T00:00:00Z");
  const dataFim = dataOuNulo(fim, "T23:59:59Z");
  if (dataIni || dataFim) {
    where.date = {};
    if (dataIni) where.date.gte = dataIni;
    if (dataFim) where.date.lte = dataFim;
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
  const body = await lerCorpo(req);
  const type = body.type;
  const amount = Number(body.amount);
  if (!["entrada", "saida"].includes(type) || !amount || amount <= 0) {
    return NextResponse.json({ error: "Tipo (entrada/saida) e valor positivo obrigatórios." }, { status: 400 });
  }
  const lanc = await prisma.lancamento.create({
    data: {
      type,
      amount,
      description: texto(body.description) || null,
      // "YYYY-MM-DD" puro vira meia-noite UTC — em fuso negativo (Brasil) isso
      // exibe um dia ANTES do que foi escolhido. Meio-dia evita virar o dia
      // em qualquer fuso real.
      date: body.date ? new Date(body.date + "T12:00:00") : new Date(),
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
