import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function PATCH(req, { params }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const data = {};
  if ("diasMin" in body) data.diasMin = Number(body.diasMin);
  if ("diasMax" in body) data.diasMax = body.diasMax === "" || body.diasMax == null ? null : Number(body.diasMax);
  if ("mensagem" in body) data.mensagem = (body.mensagem || "").trim();
  if ("ativa" in body) data.ativa = !!body.ativa;
  if ("ordem" in body) data.ordem = Number(body.ordem);
  if ("canalSugerido" in body) data.canalSugerido = body.canalSugerido || null;
  const regra = await prisma.regraCobranca.update({ where: { id }, data });
  return NextResponse.json(regra);
}

export async function DELETE(_req, { params }) {
  const { id } = await params;
  await prisma.regraCobranca.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
