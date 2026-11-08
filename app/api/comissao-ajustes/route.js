import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { lerCorpo, texto } from "@/lib/corpo";
import { registrarAuditoria } from "@/lib/auditoria";

const num = (v) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
};

// Adiantamentos/descontos de comissão. Ver: a própria pessoa (só os dela) ou qualquer admin. Lançar/editar/apagar: admin que NÃO
// seja o próprio colaborador (ninguém lança desconto/adiantamento para si mesmo).
export async function GET(req) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const userId = new URL(req.url).searchParams.get("userId") || user.id;
  if (userId !== user.id && !isAdmin(user)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const itens = await prisma.comissaoAjuste.findMany({ where: { userId }, orderBy: { data: "desc" }, take: 100 });
  // O pendente soma TODOS os lançamentos em aberto, não só os 100 que aparecem na lista (com mais de 100, os antigos sumiam da conta).
  const aberto = await prisma.comissaoAjuste.aggregate({ where: { userId, descontadoEm: null }, _sum: { valor: true } });
  const pendente = aberto._sum.valor || 0;
  return NextResponse.json({ itens, pendente: Math.round(pendente * 100) / 100, podeLancar: isAdmin(user) && userId !== user.id });
}

async function autorizar(userIdAlvo) {
  const user = await getCurrentUser();
  if (!user) return { erro: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  if (!isAdmin(user)) return { erro: NextResponse.json({ error: "Só admin." }, { status: 403 }) };
  if (userIdAlvo === user.id) return { erro: NextResponse.json({ error: "Você não pode lançar para si mesmo." }, { status: 403 }) };
  return { user };
}

export async function POST(req) {
  const body = await lerCorpo(req);
  const userId = texto(body.userId);
  const { erro, user } = await autorizar(userId);
  if (erro) return erro;
  const tipo = body.tipo === "desconto" ? "desconto" : "adiantamento";
  const valor = num(body.valor);
  if (!userId || !valor) return NextResponse.json({ error: "Informe o colaborador e um valor maior que zero." }, { status: 400 });
  // Colaborador inexistente dava erro 500 (chave estrangeira) em vez de uma mensagem; e valor absurdo (vírgula no lugar errada) passava.
  const alvo = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true } });
  if (!alvo) return NextResponse.json({ error: "Colaborador não encontrado." }, { status: 404 });
  if (valor > 100000) return NextResponse.json({ error: "Valor acima de R$ 100.000 — confira se não foi erro de digitação." }, { status: 400 });
  // Sem data informada vale o dia de hoje em Brasília (new Date() em UTC já vira o dia seguinte depois das 21h).
  const hojeBR = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(texto(body.data)) ? texto(body.data) : hojeBR;
  const data = new Date(dia + "T12:00:00.000Z");
  const item = await prisma.comissaoAjuste.create({ data: { userId, tipo, valor, descricao: texto(body.descricao) || null, data } });
  registrarAuditoria({ usuario: user?.name, acao: "lancar_ajuste_comissao", entidade: "ComissaoAjuste", entidadeId: item.id, detalhe: `${tipo} de R$ ${valor} para ${alvo.name}${item.descricao ? ` — ${item.descricao}` : ""}` });
  return NextResponse.json(item);
}

// Marca como descontado (ou volta para pendente).
export async function PATCH(req) {
  const body = await lerCorpo(req);
  const item = await prisma.comissaoAjuste.findUnique({ where: { id: texto(body.id) } });
  if (!item) return NextResponse.json({ error: "Lançamento não encontrado." }, { status: 404 });
  const { erro, user } = await autorizar(item.userId);
  if (erro) return erro;
  const r = await prisma.comissaoAjuste.update({ where: { id: item.id }, data: { descontadoEm: body.descontado ? new Date() : null } });
  registrarAuditoria({ usuario: user?.name, acao: body.descontado ? "descontar_ajuste_comissao" : "reabrir_ajuste_comissao", entidade: "ComissaoAjuste", entidadeId: item.id, detalhe: `${item.tipo} de R$ ${item.valor}` });
  return NextResponse.json(r);
}

export async function DELETE(req) {
  const id = new URL(req.url).searchParams.get("id");
  const item = id ? await prisma.comissaoAjuste.findUnique({ where: { id } }) : null;
  if (!item) return NextResponse.json({ error: "Lançamento não encontrado." }, { status: 404 });
  const { erro, user } = await autorizar(item.userId);
  if (erro) return erro;
  await prisma.comissaoAjuste.delete({ where: { id } });
  registrarAuditoria({ usuario: user?.name, acao: "apagar_ajuste_comissao", entidade: "ComissaoAjuste", entidadeId: id, detalhe: `${item.tipo} de R$ ${item.valor}${item.descricao ? ` — ${item.descricao}` : ""}` });
  return NextResponse.json({ ok: true });
}
