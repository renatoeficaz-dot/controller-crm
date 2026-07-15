import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function PATCH(req, { params }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const data = {};
  if ("title" in body) data.title = (body.title || "").trim();
  if ("notes" in body) data.notes = (body.notes || "").trim() || null;
  if ("dueDate" in body) data.dueDate = new Date(body.dueDate);
  if ("done" in body) data.done = !!body.done;
  if ("tipoId" in body) data.tipoId = body.tipoId || null;
  const task = await prisma.task.update({
    where: { id },
    data,
    include: {
      contact: { select: { id: true, name: true, phone: true } },
      tipo: { select: { id: true, name: true, color: true } },
    },
  });
  return NextResponse.json(task);
}

export async function DELETE(_req, { params }) {
  const { id } = await params;
  await prisma.task.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
