import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { negarSeNaoPodeVerContato } from "@/lib/contatoAcesso";

export async function DELETE(_req, { params }) {
  const { id } = await params;
  // Sem isso dava pra mexer em tentativa de um lead de outra
  // pessoa so trocando o id na URL — a checagem no /api/contacts nao cobre
  // essa rota, porque aqui a chave e a da propria entidade.
  const _e = await prisma.tentativaContato.findUnique({ where: { id }, select: { contactId: true } });
  if (!_e) return NextResponse.json({ error: "Tentativa não encontrada." }, { status: 404 });
  const negado = await negarSeNaoPodeVerContato(_e.contactId);
  if (negado) return negado;
  await prisma.tentativaContato.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
