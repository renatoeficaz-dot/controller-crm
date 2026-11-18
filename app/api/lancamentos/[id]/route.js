import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { lerCorpo, texto } from "@/lib/corpo";
// Data "AAAA-MM-DD" do formulário -> meio-dia (não vira o dia em fuso negativo). Inválida = null (antes ia ao Prisma e dava erro 500).
function dataDoForm(v) {
  if (!v) return undefined;
  const d = new Date(String(v).slice(0, 10) + "T12:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}
// Categoria/banco/cliente que não existem (id velho, apagado) davam erro de chave no banco (500). Categoria de saída num lançamento de
// entrada (e o contrário) bagunçava as pizzas por categoria.
async function conferirVinculos({ type, categoriaId, bancoId, contactId }) {
  if (categoriaId) {
    const c = await prisma.lancamentoCategoria.findUnique({ where: { id: categoriaId }, select: { type: true } });
    if (!c) return "Categoria não encontrada.";
    if (c.type !== type) return type === "entrada" ? "Essa categoria é de saída — escolha uma categoria de entrada." : "Essa categoria é de entrada — escolha uma categoria de saída.";
  }
  if (bancoId && !(await prisma.banco.findUnique({ where: { id: bancoId }, select: { id: true } }))) return "Conta (banco) não encontrada.";
  if (contactId && !(await prisma.contact.findUnique({ where: { id: contactId }, select: { id: true } }))) return "Cliente não encontrado.";
  return null;
}


export async function PATCH(req, { params }) {
  const { id } = await params;
  const body = await lerCorpo(req);
  const type = body.type;
  const amount = Number(body.amount);
  if (!["entrada", "saida"].includes(type) || !amount || amount <= 0) {
    return NextResponse.json({ error: "Tipo (entrada/saida) e valor positivo obrigatórios." }, { status: 400 });
  }
  const atual = await prisma.lancamento.findUnique({ where: { id }, select: { id: true, type: true, amount: true, parcelaId: true, transferenciaId: true } });
  if (!atual) return NextResponse.json({ error: "Lançamento não encontrado." }, { status: 404 }); // antes: erro 500
  const dataLanc = dataDoForm(body.date);
  if (dataLanc === null) return NextResponse.json({ error: "Data inválida." }, { status: 400 });
  const mudouValor = Math.abs(amount - atual.amount) > 0.004 || type !== atual.type;
  // Lançamento de BAIXA de parcela: mudar o valor aqui deixava o caixa diferente da parcela (metas, comissão e conciliação leem os dois).
  if (atual.parcelaId && mudouValor) {
    return NextResponse.json({ error: "Esse lançamento é de uma baixa de parcela: corrija o valor pela ficha do cliente (editar a baixa), não aqui." }, { status: 409 });
  }
  const conta = await prisma.contaPagar.findFirst({ where: { lancamentoId: id }, select: { id: true } });
  if (conta && mudouValor) {
    return NextResponse.json({ error: "Esse lançamento é do pagamento de uma conta a pagar: estorne e pague a conta de novo com o valor certo." }, { status: 409 });
  }
  const erroVinculo = await conferirVinculos({ type, categoriaId: body.categoriaId || null, bancoId: body.bancoId || null, contactId: body.contactId || null });
  if (erroVinculo) return NextResponse.json({ error: erroVinculo }, { status: 400 });
  // Transferência entre contas: o outro lado acompanha valor, data e descrição (antes ficava com o valor antigo e o saldo das contas
  // não fechava). O tipo de cada lado não muda.
  if (atual.transferenciaId) {
    if (type !== atual.type) return NextResponse.json({ error: "Numa transferência não dá para trocar entrada por saída." }, { status: 409 });
    await prisma.lancamento.updateMany({
      where: { transferenciaId: atual.transferenciaId, id: { not: id } },
      data: { amount, description: texto(body.description) || null, ...(dataLanc ? { date: dataLanc } : {}) },
    });
  }
  const lanc = await prisma.lancamento.update({
    where: { id },
    data: {
      type,
      amount,
      description: texto(body.description) || null,
      // "YYYY-MM-DD" puro vira meia-noite UTC — em fuso negativo (Brasil) isso
      // exibe um dia ANTES do que foi escolhido. Meio-dia evita virar o dia
      // em qualquer fuso real.
      date: dataLanc,
      categoriaId: body.categoriaId || null,
      bancoId: body.bancoId || null,
      contactId: body.contactId || null,
    },
    include: {
      categoria: { select: { id: true, name: true, type: true } },
      banco: { select: { id: true, name: true } },
      contact: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json(lanc);
}

export async function DELETE(_req, { params }) {
  const { id } = await params;
  const l = await prisma.lancamento.findUnique({ where: { id }, select: { transferenciaId: true } });
  // Saída do pagamento de uma conta a pagar: apagar só o lançamento deixava a conta "paga" sem a saída no caixa.
  const conta = l ? await prisma.contaPagar.findFirst({ where: { lancamentoId: id }, select: { descricao: true } }) : null;
  if (conta) return NextResponse.json({ error: `Esse lançamento é do pagamento da conta "${conta.descricao}". Estorne a conta em Contas a pagar (o lançamento sai junto).` }, { status: 409 });
  try {
    // Transferência: os dois lados saem juntos (antes sobrava um lado e o saldo das duas contas ficava errado).
    if (l?.transferenciaId) await prisma.lancamento.deleteMany({ where: { transferenciaId: l.transferenciaId } });
    else await prisma.lancamento.delete({ where: { id } });
  } catch (err) {
    // P2025 = já não existe (ex.: excluído de novo por um segundo clique, ou
    // o "desfazer" de 5s já tinha rodado) — o resultado que importa (não
    // existir mais) já está garantido, então trata como sucesso.
    if (err.code !== "P2025") {
      return NextResponse.json({ error: "Erro ao excluir o lançamento." }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true });
}
