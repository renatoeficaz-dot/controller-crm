import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function PATCH(req, { params }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const name = (body.name || "").trim();
  if (!name) return NextResponse.json({ error: "Nome não pode ficar vazio." }, { status: 400 });
  const banco = await prisma.banco.update({ where: { id }, data: { name } });
  return NextResponse.json(banco);
}

export async function DELETE(_req, { params }) {
  const { id } = await params;
  await prisma.banco.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
