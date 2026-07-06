import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Edita um número (ex.: reatribuir usuário, mudar instância)
export async function PATCH(req, { params }) {
  const { id } = await params;
  const body = await req.json();
  const data = {};
  for (const f of ["label", "number", "instance"]) {
    if (f in body) data[f] = (body[f] || "").trim();
  }
  if ("userId" in body) data.userId = body.userId || null;
  if ("unitId" in body) data.unitId = body.unitId || null;
  if ("agentId" in body) data.agentId = body.agentId || null;
  if ("estadosCobranca" in body) data.estadosCobranca = (body.estadosCobranca || "").trim() || null;
  if ("mensagemCobranca" in body) data.mensagemCobranca = (body.mensagemCobranca || "").trim() || null;
  const updated = await prisma.whatsappNumber.update({
    where: { id },
    data,
    include: {
      user: { select: { id: true, name: true } },
      unit: { select: { id: true, name: true, number: true } },
    },
  });
  return NextResponse.json(updated);
}

// Remove um número
export async function DELETE(_req, { params }) {
  const { id } = await params;
  await prisma.whatsappNumber.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
