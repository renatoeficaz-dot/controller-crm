import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Desfaz uma exclusão feita há menos de 24h (ver DELETE em .../route.js).
export async function POST(_req, { params }) {
  const { id } = await params;
  const contact = await prisma.contact.findUnique({ where: { id }, select: { excluidoEm: true } });
  if (!contact?.excluidoEm) {
    return NextResponse.json({ error: "Este lead não está excluído." }, { status: 400 });
  }
  const restaurado = await prisma.contact.update({ where: { id }, data: { excluidoEm: null } });
  return NextResponse.json(restaurado);
}
