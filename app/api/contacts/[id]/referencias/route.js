import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { normalizeBrPhone } from "@/lib/evolution";
import { negarSeNaoPodeVerContato } from "@/lib/contatoAcesso";

// Lista os contatos de referência (item 73) de um lead
export async function GET(_req, { params }) {
  const { id } = await params;
  const negado = await negarSeNaoPodeVerContato(id);
  if (negado) return negado;
  const referencias = await prisma.contatoReferencia.findMany({
    where: { contactId: id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(referencias);
}

// Adiciona um contato de referência
export async function POST(req, { params }) {
  const { id } = await params;
  const negado = await negarSeNaoPodeVerContato(id);
  if (negado) return negado;
  const body = await req.json().catch(() => ({})) ?? {};
  const nome = (body.nome || "").trim();
  const telefoneRaw = (body.telefone || "").trim();
  if (!nome || !telefoneRaw) {
    return NextResponse.json({ error: "Preencha nome e telefone." }, { status: 400 });
  }
  const telefone = normalizeBrPhone(telefoneRaw) || telefoneRaw.replace(/\D/g, "");
  const contact = await prisma.contact.findUnique({ where: { id }, select: { id: true } });
  if (!contact) return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });

  const referencia = await prisma.contatoReferencia.create({
    data: { contactId: id, nome, telefone, relacao: body.relacao || null },
  });
  return NextResponse.json(referencia);
}
