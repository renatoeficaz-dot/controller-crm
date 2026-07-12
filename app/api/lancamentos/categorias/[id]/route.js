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
  if ("type" in body && ["entrada", "saida"].includes(body.type)) data.type = body.type;
  const categoria = await prisma.lancamentoCategoria.update({ where: { id }, data });
  return NextResponse.json(categoria);
}

export async function DELETE(_req, { params }) {
  const { id } = await params;
  await prisma.lancamentoCategoria.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
