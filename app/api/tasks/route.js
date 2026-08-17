import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { lerCorpo, texto } from "@/lib/corpo";

// Lista tarefas (com filtros opcionais) — usado na aba "Tarefas" e no card do lead.
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const contactId = searchParams.get("contactId");
  const done = searchParams.get("done"); // "true" | "false" | null (todas)
  const tipoId = searchParams.get("tipoId");

  const where = {};
  if (contactId) where.contactId = contactId;
  if (done === "true") where.done = true;
  if (done === "false") where.done = false;
  if (tipoId) where.tipoId = tipoId;

  // Tarefa sem responsavel próprio segue implícito o responsável do LEAD (ver
  // comentário no schema) — filtrar só por task.responsavel escondia a
  // maioria das tarefas de cada pessoa, que nunca tiveram isso preenchido.
  const responsavel = searchParams.get("responsavel");
  if (responsavel) {
    where.OR = [{ responsavel }, { responsavel: null, contact: { responsavel } }];
  }

  const tasks = await prisma.task.findMany({
    where,
    orderBy: { dueDate: "asc" },
    include: {
      contact: { select: { id: true, name: true, phone: true, responsavel: true } },
      tipo: { select: { id: true, name: true, color: true, emoji: true } },
    },
  });
  return NextResponse.json(tasks);
}

// Cria uma tarefa avulsa pra um lead (diferente das tarefas automáticas de cobrança,
// que nascem vinculadas a uma parcela).
export async function POST(req) {
  const body = await lerCorpo(req);
  const title = texto(body.title);
  const contactId = body.contactId;
  if (!title || !contactId) {
    return NextResponse.json({ error: "Preencha o título e o lead." }, { status: 400 });
  }
  const task = await prisma.task.create({
    data: {
      contactId,
      title,
      notes: texto(body.notes) || null,
      dueDate: body.dueDate ? new Date(body.dueDate) : new Date(),
      tipoId: body.tipoId || null,
      responsavel: body.responsavel || null,
    },
    include: {
      contact: { select: { id: true, name: true, phone: true, responsavel: true } },
      tipo: { select: { id: true, name: true, color: true, emoji: true } },
    },
  });
  return NextResponse.json(task);
}
