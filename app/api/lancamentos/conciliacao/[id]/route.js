import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { lerCorpo, texto } from "@/lib/corpo";

// Resolve um movimento pendente do extrato: lançar, vincular a um lançamento existente, ignorar ou reabrir.
export async function PATCH(req, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const { id } = await params;
  const mov = await prisma.extratoMovimento.findUnique({ where: { id } });
  if (!mov) return NextResponse.json({ error: "Movimento não encontrado." }, { status: 404 });
  const body = await lerCorpo(req);
  const acao = texto(body.acao);
  const agora = new Date();
  const base = { resolvidoPor: user.name, resolvidoEm: agora, observacao: texto(body.observacao) || null };
  const jaResolvido = () => NextResponse.json({ error: "Esse movimento já foi resolvido." }, { status: 409 });

  if (acao === "lancar") {
    if (mov.status !== "pendente") return jaResolvido();
    const categoriaId = texto(body.categoriaId) || null;
    const contactId = texto(body.contactId) || null;
    if (categoriaId && !(await prisma.lancamentoCategoria.findUnique({ where: { id: categoriaId }, select: { id: true } }))) return NextResponse.json({ error: "Categoria não encontrada." }, { status: 400 });
    if (contactId && !(await prisma.contact.findUnique({ where: { id: contactId }, select: { id: true } }))) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 400 });
    const descricao = texto(body.descricao) || mov.descricao || (mov.tipo === "entrada" ? "Entrada conferida no extrato" : "Saída conferida no extrato");
    const lanc = await prisma.lancamento.create({
      data: { type: mov.tipo, amount: mov.valor, description: descricao, date: mov.data, bancoId: mov.bancoId, categoriaId, contactId, conciliadoEm: agora },
    });
    await prisma.extratoMovimento.update({ where: { id }, data: { status: "lancado", lancamentoId: lanc.id, ...base } });
    await prisma.auditLog.create({ data: { usuario: user.name, acao: "lancar_do_extrato", entidade: "Lancamento", entidadeId: lanc.id, detalhe: `${mov.tipo} R$ ${mov.valor.toFixed(2)} — ${descricao}` } }).catch(() => {});
    return NextResponse.json({ ok: true, lancamentoId: lanc.id });
  }

  if (acao === "vincular") {
    if (mov.status !== "pendente") return jaResolvido();
    const lancId = texto(body.lancamentoId);
    const l = lancId ? await prisma.lancamento.findUnique({ where: { id: lancId } }) : null;
    if (!l) return NextResponse.json({ error: "Lançamento não encontrado." }, { status: 404 });
    if (l.type !== mov.tipo) return NextResponse.json({ error: "O lançamento é de outro tipo (entrada/saída)." }, { status: 400 });
    if (l.conciliadoEm) return NextResponse.json({ error: "Esse lançamento já foi conferido com outro movimento." }, { status: 409 });
    await prisma.$transaction([
      prisma.extratoMovimento.update({ where: { id }, data: { status: "conciliado", lancamentoId: l.id, ...base } }),
      prisma.lancamento.update({ where: { id: l.id }, data: { conciliadoEm: agora } }),
    ]);
    return NextResponse.json({ ok: true });
  }

  if (acao === "ignorar") {
    if (mov.status !== "pendente") return jaResolvido();
    await prisma.extratoMovimento.update({ where: { id }, data: { status: "ignorado", ...base } });
    return NextResponse.json({ ok: true });
  }

  if (acao === "reabrir") {
    // Só dá pra reabrir o que foi ignorado: desfazer um lançamento criado exige apagá-lo em Lançamentos.
    if (mov.status !== "ignorado") return NextResponse.json({ error: "Só movimentos ignorados podem ser reabertos." }, { status: 409 });
    await prisma.extratoMovimento.update({ where: { id }, data: { status: "pendente", resolvidoPor: null, resolvidoEm: null, observacao: null } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
}
