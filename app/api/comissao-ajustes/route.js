import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { lerCorpo, texto } from "@/lib/corpo";

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
  const pendente = itens.filter((i) => !i.descontadoEm).reduce((t, i) => t + i.valor, 0);
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
  const { erro } = await autorizar(userId);
  if (erro) return erro;
  const tipo = body.tipo === "desconto" ? "desconto" : "adiantamento";
  const valor = num(body.valor);
  if (!userId || !valor) return NextResponse.json({ error: "Informe o colaborador e um valor maior que zero." }, { status: 400 });
  const data = /^\d{4}-\d{2}-\d{2}$/.test(texto(body.data)) ? new Date(texto(body.data) + "T12:00:00.000Z") : new Date();
  const item = await prisma.comissaoAjuste.create({ data: { userId, tipo, valor, descricao: texto(body.descricao) || null, data } });
  return NextResponse.json(item);
}

// Marca como descontado (ou volta para pendente).
export async function PATCH(req) {
  const body = await lerCorpo(req);
  const item = await prisma.comissaoAjuste.findUnique({ where: { id: texto(body.id) } });
  if (!item) return NextResponse.json({ error: "Lançamento não encontrado." }, { status: 404 });
  const { erro } = await autorizar(item.userId);
  if (erro) return erro;
  const r = await prisma.comissaoAjuste.update({ where: { id: item.id }, data: { descontadoEm: body.descontado ? new Date() : null } });
  return NextResponse.json(r);
}

export async function DELETE(req) {
  const id = new URL(req.url).searchParams.get("id");
  const item = id ? await prisma.comissaoAjuste.findUnique({ where: { id } }) : null;
  if (!item) return NextResponse.json({ error: "Lançamento não encontrado." }, { status: 404 });
  const { erro } = await autorizar(item.userId);
  if (erro) return erro;
  await prisma.comissaoAjuste.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
