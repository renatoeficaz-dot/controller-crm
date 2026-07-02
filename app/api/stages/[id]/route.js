import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Edita uma etapa (ex.: nome, cor, responsável automático)
export async function PATCH(req, { params }) {
  const { id } = await params;
  const body = await req.json();
  const data = {};
  if ("name" in body) data.name = (body.name || "").trim();
  if ("color" in body) data.color = body.color || "#64748b";
  if ("autoResponsavel" in body) data.autoResponsavel = body.autoResponsavel || null;
  const stage = await prisma.stage.update({ where: { id }, data });
  return NextResponse.json(stage);
}

// Remove uma etapa
export async function DELETE(_req, { params }) {
  const { id } = await params;
  await prisma.stage.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
