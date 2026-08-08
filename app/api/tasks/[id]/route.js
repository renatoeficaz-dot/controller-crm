import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { negarSeNaoPodeVerContato } from "@/lib/contatoAcesso";

export async function PATCH(req, { params }) {
  const { id } = await params;
  // Sem isso dava pra mexer em tarefa de um lead de outra
  // pessoa so trocando o id na URL — a checagem no /api/contacts nao cobre
  // essa rota, porque aqui a chave e a da propria entidade.
  const _e = await prisma.task.findUnique({ where: { id }, select: { contactId: true } });
  if (!_e) return NextResponse.json({ error: "Tarefa não encontrada." }, { status: 404 });
  const negado = await negarSeNaoPodeVerContato(_e.contactId);
  if (negado) return negado;
  const body = await req.json().catch(() => ({}));
  const data = {};
  if ("title" in body) data.title = (body.title || "").trim();
  if ("notes" in body) data.notes = (body.notes || "").trim() || null;
  if ("dueDate" in body) data.dueDate = new Date(body.dueDate);
  if ("done" in body) data.done = !!body.done;
  if ("tipoId" in body) data.tipoId = body.tipoId || null;
  if ("contactId" in body && body.contactId) data.contactId = body.contactId;
  if ("responsavel" in body) data.responsavel = body.responsavel || null;
  const task = await prisma.task.update({
    where: { id },
    data,
    include: {
      contact: { select: { id: true, name: true, phone: true } },
      tipo: { select: { id: true, name: true, color: true, emoji: true } },
    },
  });
  return NextResponse.json(task);
}

export async function DELETE(_req, { params }) {
  const { id } = await params;
  // Sem isso dava pra mexer em tarefa de um lead de outra
  // pessoa so trocando o id na URL — a checagem no /api/contacts nao cobre
  // essa rota, porque aqui a chave e a da propria entidade.
  const _e = await prisma.task.findUnique({ where: { id }, select: { contactId: true } });
  if (!_e) return NextResponse.json({ error: "Tarefa não encontrada." }, { status: 404 });
  const negado = await negarSeNaoPodeVerContato(_e.contactId);
  if (negado) return negado;
  await prisma.task.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
