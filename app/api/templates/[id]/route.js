import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Edita uma mensagem pronta
export async function PATCH(req, { params }) {
  const { id } = await params;
  const body = await req.json();
  const data = {};
  if ("title" in body) data.title = (body.title || "").trim();
  if ("body" in body) data.body = (body.body || "").trim();
  const tpl = await prisma.messageTemplate.update({ where: { id }, data });
  return NextResponse.json(tpl);
}

// Remove uma mensagem pronta
export async function DELETE(_req, { params }) {
  const { id } = await params;
  await prisma.messageTemplate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
