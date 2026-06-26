import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function PATCH(req, { params }) {
  const { id } = await params;
  const { name, color } = await req.json().catch(() => ({}));
  const data = {};
  if (name) data.name = name.trim();
  if (color) data.color = color;
  const tag = await prisma.tag.update({ where: { id }, data });
  return NextResponse.json(tag);
}

export async function DELETE(_req, { params }) {
  const { id } = await params;
  await prisma.tag.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
