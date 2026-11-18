import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { pagarConta, estornarConta } from "@/lib/contasPagar";
import { lerCorpo, ehNaoEncontrado, respostaNaoEncontrado, texto } from "@/lib/corpo";

export async function PATCH(req, { params }) {
  try {
    const { id } = await params;
    const body = await lerCorpo(req);
  
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
    if ("descricao" in body) data.descricao = texto(body.descricao);
    // Valor inválido ZERAVA a conta em silêncio (Number("abc") || 0) e vencimento inválido derrubava a rota com 500.
    if ("valor" in body) {
      const v = Number(body.valor);
      if (!Number.isFinite(v) || v <= 0) return NextResponse.json({ error: "Informe um valor válido." }, { status: 400 });
      data.valor = v;
    }
    if ("vencimento" in body) {
      const venc = new Date(String(body.vencimento || "").slice(0, 10) + "T00:00:00.000Z");
      if (Number.isNaN(venc.getTime())) return NextResponse.json({ error: "Data de vencimento inválida." }, { status: 400 });
      data.vencimento = venc;
    }
    if ("categoriaId" in body) data.categoriaId = body.categoriaId || null;
    if ("bancoId" in body) data.bancoId = body.bancoId || null;
    if ("observacao" in body) data.observacao = texto(body.observacao) || null;
  
    const conta = await prisma.contaPagar.update({ where: { id }, data });
    return NextResponse.json(conta);
  } catch (err) {
    // Registro do `where` não existe (link velho, dois cliques, id
    // chutado): é "não achei", não erro de servidor.
    if (ehNaoEncontrado(err)) return respostaNaoEncontrado();
    throw err;
  }
}

// ?futuras=1 remove também as ocorrências seguintes ainda em aberto — útil pra
// cancelar uma recorrência sem apagar o histórico do que já foi pago.
export async function DELETE(req, { params }) {
  try {
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
  } catch (err) {
    // Registro do `where` não existe (link velho, dois cliques, id
    // chutado): é "não achei", não erro de servidor.
    if (ehNaoEncontrado(err)) return respostaNaoEncontrado();
    throw err;
  }
}
