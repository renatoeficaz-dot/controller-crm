import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/session";

export async function DELETE(_req, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  await prisma.comissaoFaixa.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
