import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";

export async function PATCH(req, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const { tipo, conferido } = await req.json().catch(() => ({})) ?? {};

  const data = {};
  if (tipo) data.tipo = tipo;
  if (conferido != null) {
    data.conferido = !!conferido;
    data.conferidoPor = conferido ? user?.name || null : null;
    data.conferidoEm = conferido ? new Date() : null;
  }

  const documento = await prisma.documento.update({ where: { id }, data });
  return NextResponse.json(documento);
}

export async function DELETE(_req, { params }) {
  const { id } = await params;
  await prisma.documento.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
