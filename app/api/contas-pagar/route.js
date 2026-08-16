import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { criarContaPagar } from "@/lib/contasPagar";
import { lerCorpo } from "@/lib/corpo";

export async function GET(req) {
  const sp = new URL(req.url).searchParams;
  const status = sp.get("status"); // "aberto" | "pago" | vazio = todos
  const de = sp.get("de");
  const ate = sp.get("ate");

  const where = {};
  if (status === "aberto") where.pago = false;
  if (status === "pago") where.pago = true;
  if (de || ate) {
    where.vencimento = {};
    if (de) where.vencimento.gte = new Date(de + "T00:00:00.000Z");
    if (ate) where.vencimento.lte = new Date(ate + "T23:59:59.999Z");
  }

  const contas = await prisma.contaPagar.findMany({
    where,
    orderBy: [{ pago: "asc" }, { vencimento: "asc" }],
    include: {
      categoria: { select: { id: true, name: true } },
      banco: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json(contas);
}

export async function POST(req) {
  const body = await lerCorpo(req);
  if (!body.descricao?.trim()) {
    return NextResponse.json({ error: "Informe a descrição da conta." }, { status: 400 });
  }
  const valor = Number(body.valor);
  if (!valor || valor <= 0) {
    return NextResponse.json({ error: "Informe um valor válido." }, { status: 400 });
  }
  if (!body.vencimento) {
    return NextResponse.json({ error: "Informe a data de vencimento." }, { status: 400 });
  }
  // Data que o JS não entende virava `Invalid Date` e só estourava lá no
  // Prisma, devolvendo erro 500 em vez de dizer o que estava errado.
  if (Number.isNaN(new Date(body.vencimento).getTime())) {
    return NextResponse.json({ error: "Data de vencimento inválida." }, { status: 400 });
  }

  // "ilimitada" chega como recorrenciaMeses vazio/null com recorrente = true.
  const meses = body.recorrenciaMeses === "" || body.recorrenciaMeses == null ? null : Number(body.recorrenciaMeses);
  if (body.recorrente && meses != null && (meses < 2 || meses > 120)) {
    return NextResponse.json({ error: "A repetição deve ser de 2 a 120 meses (ou ilimitada)." }, { status: 400 });
  }

  const conta = await criarContaPagar({
    descricao: body.descricao.trim(),
    valor,
    vencimento: new Date(body.vencimento + "T00:00:00.000Z"),
    categoriaId: body.categoriaId,
    bancoId: body.bancoId,
    observacao: body.observacao,
    recorrente: !!body.recorrente,
    recorrenciaMeses: meses,
  });

  return NextResponse.json(conta);
}
