import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { lerCorpo, ehNaoEncontrado, respostaNaoEncontrado } from "@/lib/corpo";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { dadosLink } from "@/lib/linksUteis";

export async function PATCH(req, { params }) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    const body = await lerCorpo(req);
    const { data, erro } = dadosLink(body, isAdmin(user), true);
    if (erro) return NextResponse.json({ error: erro }, { status: 400 });
    const link = await prisma.linkUtil.update({ where: { id }, data });
    if (isAdmin(user)) return NextResponse.json(link);
    const { login, senha, ...resto } = link;
    return NextResponse.json(resto);
  } catch (err) {
    if (ehNaoEncontrado(err)) return respostaNaoEncontrado();
    throw err;
  }
}

export async function DELETE(_req, { params }) {
  const { id } = await params;
  await prisma.linkUtil.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
