import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

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

  const tasks = await prisma.task.findMany({
    where,
    orderBy: { dueDate: "asc" },
    include: {
      contact: { select: { id: true, name: true, phone: true } },
      tipo: { select: { id: true, name: true, color: true } },
    },
  });
  return NextResponse.json(tasks);
}

// Cria uma tarefa avulsa pra um lead (diferente das tarefas automáticas de cobrança,
// que nascem vinculadas a uma parcela).
export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const title = (body.title || "").trim();
  const contactId = body.contactId;
  if (!title || !contactId) {
    return NextResponse.json({ error: "Preencha o título e o lead." }, { status: 400 });
  }
  const task = await prisma.task.create({
    data: {
      contactId,
      title,
      notes: (body.notes || "").trim() || null,
      dueDate: body.dueDate ? new Date(body.dueDate) : new Date(),
      tipoId: body.tipoId || null,
    },
    include: {
      contact: { select: { id: true, name: true, phone: true } },
      tipo: { select: { id: true, name: true, color: true } },
    },
  });
  return NextResponse.json(task);
}
