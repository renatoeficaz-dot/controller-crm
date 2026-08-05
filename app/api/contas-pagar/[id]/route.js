import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { pagarConta, estornarConta } from "@/lib/contasPagar";

export async function PATCH(req, { params }) {
  const { id } = await params;
  const body = await req.json();

  // Pagar/estornar tem efeito no caixa, então passa pelas funções que também
  // criam/removem o lançamento — nunca mexa no campo `pago` direto.
  if ("pago" in body) {
    const conta = body.pago
      ? await pagarConta(id, { valorPago: body.valorPago, data: body.data, bancoId: body.bancoId })
      : await estornarConta(id);
    if (!conta) return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });
    return NextResponse.json(conta);
  }

  const data = {};
  if ("descricao" in body) data.descricao = (body.descricao || "").trim();
  if ("valor" in body) data.valor = Number(body.valor) || 0;
  if ("vencimento" in body) data.vencimento = new Date(body.vencimento + "T00:00:00.000Z");
  if ("categoriaId" in body) data.categoriaId = body.categoriaId || null;
  if ("bancoId" in body) data.bancoId = body.bancoId || null;
  if ("observacao" in body) data.observacao = (body.observacao || "").trim() || null;

  const conta = await prisma.contaPagar.update({ where: { id }, data });
  return NextResponse.json(conta);
}

// ?futuras=1 remove também as ocorrências seguintes ainda em aberto — útil pra
// cancelar uma recorrência sem apagar o histórico do que já foi pago.
export async function DELETE(req, { params }) {
  const { id } = await params;
  const futuras = new URL(req.url).searchParams.get("futuras") === "1";

  const conta = await prisma.contaPagar.findUnique({ where: { id } });
  if (!conta) return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });

  if (futuras) {
    const raizId = conta.origemId || conta.id;
    await prisma.contaPagar.deleteMany({
      where: { origemId: raizId, pago: false, vencimento: { gte: conta.vencimento } },
    });
    // A mãe só cai junto se ela mesma ainda estiver em aberto.
    await prisma.contaPagar.deleteMany({ where: { id: raizId, pago: false } });
    return NextResponse.json({ ok: true, futuras: true });
  }

  // As ocorrências apontam pra mãe com onDelete: Cascade — apagar a mãe levava
  // junto TODA a série, inclusive os meses JÁ PAGOS (o histórico do que saiu do
  // caixa). Desliga as filhas antes: as pagas viram lançamentos avulsos e
  // continuam no histórico; as futuras em aberto somem com a regra.
  const filhas = await prisma.contaPagar.findMany({ where: { origemId: id }, select: { id: true, pago: true } });
  if (filhas.length) {
    await prisma.contaPagar.updateMany({ where: { origemId: id, pago: true }, data: { origemId: null } });
    await prisma.contaPagar.deleteMany({ where: { origemId: id, pago: false } });
  }
  await prisma.contaPagar.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
