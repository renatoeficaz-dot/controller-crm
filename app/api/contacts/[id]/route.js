import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Busca um contato com suas mensagens e parcelas
export async function GET(_req, { params }) {
  const { id } = await params;
  const contact = await prisma.contact.findUnique({
    where: { id },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      stage: true,
      parcelas: { orderBy: { number: "asc" } },
    },
  });
  if (!contact) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json(contact);
}

// Atualiza dados do contato
export async function PATCH(req, { params }) {
  const { id } = await params;
  const body = await req.json();
  const data = {};
  for (const f of ["name", "phone", "email", "company", "notes", "responsavel"]) {
    if (f in body) data[f] = body[f] || null;
  }
  if ("valorCapital" in body) {
    data.valorCapital = body.valorCapital === "" || body.valorCapital == null ? null : Number(body.valorCapital);
  }
  if ("pagamentoCapital" in body) {
    data.pagamentoCapital = body.pagamentoCapital ? new Date(body.pagamentoCapital) : null;
  }
  const contact = await prisma.contact.update({ where: { id }, data });
  return NextResponse.json(contact);
}

// Remove o contato
export async function DELETE(_req, { params }) {
  const { id } = await params;
  await prisma.contact.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
