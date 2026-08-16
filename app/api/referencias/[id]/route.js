import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { normalizeBrPhone } from "@/lib/evolution";

// Edita um contato de referência
export async function PATCH(req, { params }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({})) ?? {};
  const data = {};
  if ("nome" in body) {
    const nome = (body.nome || "").trim();
    if (!nome) return NextResponse.json({ error: "Nome não pode ficar vazio." }, { status: 400 });
    data.nome = nome;
  }
  if ("telefone" in body) {
    const telefoneRaw = (body.telefone || "").trim();
    if (!telefoneRaw) return NextResponse.json({ error: "Telefone não pode ficar vazio." }, { status: 400 });
    data.telefone = normalizeBrPhone(telefoneRaw) || telefoneRaw.replace(/\D/g, "");
  }
  if ("relacao" in body) data.relacao = body.relacao || null;

  const referencia = await prisma.contatoReferencia.update({ where: { id }, data });
  return NextResponse.json(referencia);
}

// Remove um contato de referência
export async function DELETE(_req, { params }) {
  const { id } = await params;
  await prisma.contatoReferencia.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
