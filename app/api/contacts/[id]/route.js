import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser, mensagensWhere } from "@/lib/session";

// Busca um contato com suas mensagens (conforme permissão de WhatsApp) e parcelas.
// mediaUrl (base64) fica de fora — mídia é carregada sob demanda via /api/messages/[id]/media.
export async function GET(_req, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const contact = await prisma.contact.findUnique({
    where: { id },
    include: {
      messages: {
        where: mensagensWhere(user),
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          contactId: true,
          body: true,
          kind: true,
          mimeType: true,
          fileName: true,
          fromMe: true,
          status: true,
          instance: true,
          readAt: true,
          createdAt: true,
        },
      },
      stage: true,
      parcelas: { orderBy: [{ ciclo: "asc" }, { number: "asc" }] },
      tags: { select: { id: true, name: true, color: true } },
    },
  });
  if (!contact) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  // Marca as mensagens recebidas como lidas ao abrir o contato
  await prisma.message.updateMany({
    where: { contactId: id, fromMe: false, readAt: null },
    data: { readAt: new Date() },
  });
  return NextResponse.json(contact);
}

// Atualiza dados do contato
export async function PATCH(req, { params }) {
  const { id } = await params;
  const body = await req.json();
  const data = {};
  for (const f of ["name", "phone", "email", "company", "notes", "responsavel", "estado"]) {
    if (f in body) data[f] = body[f] || null;
  }
  if ("valorCapital" in body) {
    data.valorCapital = body.valorCapital === "" || body.valorCapital == null ? null : Number(body.valorCapital);
  }
  if ("pagamentoCapital" in body) {
    data.pagamentoCapital = body.pagamentoCapital ? new Date(body.pagamentoCapital) : null;
  }
  if ("iaPausada" in body) data.iaPausada = !!body.iaPausada;
  const contact = await prisma.contact.update({ where: { id }, data });
  return NextResponse.json(contact);
}

// Remove o contato
export async function DELETE(_req, { params }) {
  const { id } = await params;
  await prisma.contact.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
