import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser, getSession, mensagensWhere } from "@/lib/session";
import { registrarAuditoria } from "@/lib/auditoria";
import { contatoComCaloteMesmoCpf } from "@/lib/cpfBloqueio";

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
  for (const f of ["name", "phone", "notes", "responsavel", "estado", "genero", "tipoCliente", "cpf"]) {
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

  // Não bloqueia salvar o CPF em si (só bloqueia avançar no funil, no
  // /move) — mas já avisa na hora se bate com outro cadastro que deu calote.
  let caloteAviso = null;
  if ("cpf" in body && contact.cpf) {
    caloteAviso = await contatoComCaloteMesmoCpf(contact.cpf, id);
  }

  return NextResponse.json({ ...contact, caloteAviso });
}

// Remove o contato
export async function DELETE(_req, { params }) {
  const { id } = await params;
  const [session, contact] = await Promise.all([
    getSession(),
    prisma.contact.findUnique({ where: { id }, select: { name: true } }),
  ]);
  await prisma.contact.delete({ where: { id } });
  registrarAuditoria({
    usuario: session?.name,
    acao: "excluir_contato",
    entidade: "Contact",
    entidadeId: id,
    detalhe: contact?.name,
  });
  return NextResponse.json({ ok: true });
}
