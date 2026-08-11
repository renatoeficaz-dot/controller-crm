import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function DELETE(_req, { params }) {
  const { id } = await params;
  await prisma.linkUtil.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
