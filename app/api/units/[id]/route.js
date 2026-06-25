import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Atualiza uma unidade (editar dados ou alternar Aberta/Fechada)
export async function PATCH(req, { params }) {
  const { id } = await params;
  const body = await req.json();
  const data = {};
  for (const f of ["name", "cn", "location", "status", "score", "pin", "appVersion"]) {
    if (f in body) data[f] = body[f];
  }
  for (const f of ["number", "caixa", "progresso"]) {
    if (f in body) data[f] = body[f] === null ? null : Number(body[f]);
  }
  for (const f of ["caixaInicial", "caixaFinal"]) {
    if (f in body) data[f] = Number(body[f]);
  }
  const unit = await prisma.unit.update({ where: { id }, data });
  return NextResponse.json(unit);
}

// Remove a unidade
export async function DELETE(_req, { params }) {
  const { id } = await params;
  await prisma.unit.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
