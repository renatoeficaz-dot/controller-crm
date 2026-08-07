import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { encontrarDuplicados } from "@/lib/duplicados";
import { negarSeNaoPodeVerContato } from "@/lib/contatoAcesso";

export async function GET(_req, { params }) {
  const { id } = await params;
  const negado = await negarSeNaoPodeVerContato(id);
  if (negado) return negado;
  const contact = await prisma.contact.findUnique({ where: { id }, select: { id: true, phone: true, cpf: true } });
  if (!contact) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  const duplicados = await encontrarDuplicados(contact);
  return NextResponse.json(duplicados);
}
