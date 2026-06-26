import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function DELETE(_req, { params }) {
  const { id } = await params;
  await prisma.lancamento.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
