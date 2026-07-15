import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function PATCH(req, { params }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const data = {};
  if ("name" in body) {
    const name = (body.name || "").trim();
    if (!name) return NextResponse.json({ error: "Nome não pode ficar vazio." }, { status: 400 });
    data.name = name;
  }
  if ("color" in body) data.color = body.color;
  const tipo = await prisma.taskType.update({ where: { id }, data });
  return NextResponse.json(tipo);
}

export async function DELETE(_req, { params }) {
  const { id } = await params;
  await prisma.taskType.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
