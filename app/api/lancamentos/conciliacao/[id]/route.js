import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { lerCorpo, texto } from "@/lib/corpo";
import { valorParcelaAtual, horaLimiteEfetiva } from "@/lib/finance";
import { aplicarBaixaParcial } from "@/lib/baixaParcial";
import { planoBaixa } from "@/lib/conciliacaoOfx";
import { fecharTarefasConferidas } from "@/lib/conciliacaoServidor";

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

  if (acao === "baixar") {
    // Pix do extrato que é pagamento de cliente: o gestor escolhe o cliente e as parcelas, e a baixa sai daqui já conferida com o extrato.
    if (mov.status !== "pendente") return jaResolvido();
    if (mov.tipo !== "entrada") return NextResponse.json({ error: "Só entradas pagam parcelas." }, { status: 400 });
    const contactId = texto(body.contactId);
    const ids = Array.isArray(body.parcelaIds) ? body.parcelaIds.filter((x) => typeof x === "string") : [];
    if (!contactId || !ids.length) return NextResponse.json({ error: "Escolha o cliente e ao menos uma parcela." }, { status: 400 });
    const [cfg, contato, parcelas] = await Promise.all([
      prisma.config.findUnique({ where: { id: "singleton" } }),
      prisma.contact.findUnique({ where: { id: contactId }, select: { id: true, name: true, tipoCliente: true, horarioRecebimento: true } }),
      prisma.parcela.findMany({ where: { id: { in: ids }, contactId, paid: false, renegociada: false }, orderBy: [{ dueDate: "asc" }, { number: "asc" }] }),
    ]);
    if (!contato) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
    if (parcelas.length !== new Set(ids).size) return NextResponse.json({ error: "Alguma parcela já foi paga ou não é desse cliente. Atualize e escolha de novo." }, { status: 409 });
    const lista = parcelas.map((p) => ({ id: p.id, amount: p.amount, valorPago: p.valorPago || 0, devido: valorParcelaAtual(p, undefined, { multaPct: cfg?.multaPct, horaLimite: horaLimiteEfetiva(contato, cfg) }) }));
    const plano = planoBaixa(lista, mov.valor);
    if (plano.sobra > 0.01) return NextResponse.json({ error: `O Pix é de R$ ${mov.valor.toFixed(2)} e as parcelas marcadas só somam R$ ${(mov.valor - plano.sobra).toFixed(2)}. Marque mais parcelas.` }, { status: 400 });
    if (!plano.itens.length) return NextResponse.json({ error: "Nada a baixar nas parcelas marcadas." }, { status: 400 });
    const t0 = new Date(Date.now() - 1000);
    const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(mov.data);
    for (const it of plano.itens) {
      const r = await aplicarBaixaParcial({ id: it.id, valor: it.valor, formaPagamento: "pix", usuarioNome: user.name, origem: "Extrato OFX", semJuros: it.semJuros, cobrarDif: false, horaPagamento: hora, pagoEm: mov.data });
      if (r?.erro) return NextResponse.json({ error: `${r.erro} (algumas parcelas anteriores podem já ter sido baixadas; confira o cliente).` }, { status: r.status || 400 });
    }
    // Os lançamentos que a baixa acabou de criar passam a valer na data do Pix, na conta do extrato, e já contam como conferidos.
    const novos = await prisma.lancamento.findMany({ where: { parcelaId: { in: plano.itens.map((i) => i.id) }, type: "entrada", createdAt: { gte: t0 }, conciliadoEm: null }, select: { id: true }, orderBy: { createdAt: "asc" } });
    if (novos.length) await prisma.lancamento.updateMany({ where: { id: { in: novos.map((l) => l.id) } }, data: { date: mov.data, bancoId: mov.bancoId, conciliadoEm: agora } });
    await prisma.extratoMovimento.update({ where: { id }, data: { status: "lancado", lancamentoId: novos[0]?.id || null, ...base, observacao: base.observacao || `Baixa de ${contato.name}` } });
    await fecharTarefasConferidas([contactId]);
    await prisma.auditLog.create({ data: { usuario: user.name, acao: "baixar_do_extrato", entidade: "ExtratoMovimento", entidadeId: id, detalhe: `${contato.name}: R$ ${mov.valor.toFixed(2)} em ${plano.itens.length} parcela(s)` } }).catch(() => {});
    return NextResponse.json({ ok: true, parcelas: plano.itens.length });
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
