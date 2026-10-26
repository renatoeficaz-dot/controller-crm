import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { lerCorpo } from "@/lib/corpo";
import { dadosLink } from "@/lib/linksUteis";
import { getCurrentUser, isAdmin } from "@/lib/session";

// Links úteis (atalhos) que a equipe usa no dia a dia — configurável em
// Configurações > Links úteis. Login e senha salvos junto do link só o admin vê e grava.
export async function GET() {
  const user = await getCurrentUser();
  const lista = await prisma.linkUtil.findMany({ orderBy: [{ ordem: "asc" }, { createdAt: "asc" }] });
  if (isAdmin(user)) return NextResponse.json(lista);
  return NextResponse.json(lista.map(({ login, senha, ...resto }) => resto));
}

export async function POST(req) {
  const user = await getCurrentUser();
  const body = await lerCorpo(req);
  const { data, erro } = dadosLink(body, isAdmin(user), false);
  if (erro) return NextResponse.json({ error: erro }, { status: 400 });
  const ultimo = await prisma.linkUtil.findFirst({ orderBy: { ordem: "desc" } });
  const criado = await prisma.linkUtil.create({ data: { ...data, ordem: (ultimo?.ordem ?? -1) + 1 } });
  return NextResponse.json(criado);
}
