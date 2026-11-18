import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { negarSeNaoPodeVerContato } from "@/lib/contatoAcesso";
import { lerCorpo } from "@/lib/corpo";

// Atribui uma tag ao contato
export async function POST(req, { params }) {
  const { id } = await params;
  const negado = await negarSeNaoPodeVerContato(id);
  if (negado) return negado;
  const { tagId } = await lerCorpo(req);
  if (typeof tagId !== "string" || !tagId) return NextResponse.json({ error: "tagId obrigatório." }, { status: 400 });
  // Etiqueta apagada (ou id velho) dava erro 500 em vez de avisar.
  if (!(await prisma.tag.findUnique({ where: { id: tagId }, select: { id: true } }))) return NextResponse.json({ error: "Etiqueta não encontrada." }, { status: 404 });
  await prisma.contact.update({ where: { id }, data: { tags: { connect: { id: tagId } } } });
  return NextResponse.json({ ok: true });
}

// Remove uma tag do contato
export async function DELETE(req, { params }) {
  const { id } = await params;
  const negado = await negarSeNaoPodeVerContato(id);
  if (negado) return negado;
  const { tagId } = await lerCorpo(req);
  if (typeof tagId !== "string" || !tagId) return NextResponse.json({ error: "tagId obrigatório." }, { status: 400 });
  // Etiqueta apagada (ou id velho) dava erro 500 em vez de avisar.
  if (!(await prisma.tag.findUnique({ where: { id: tagId }, select: { id: true } }))) return NextResponse.json({ error: "Etiqueta não encontrada." }, { status: 404 });
  await prisma.contact.update({ where: { id }, data: { tags: { disconnect: { id: tagId } } } });
  return NextResponse.json({ ok: true });
}
