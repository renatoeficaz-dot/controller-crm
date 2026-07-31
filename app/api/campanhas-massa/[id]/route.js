import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function PATCH(req, { params }) {
  const { id } = await params;
  const { status } = await req.json();
  if (!["enviando", "cancelada"].includes(status)) {
    return NextResponse.json({ error: "Status inválido." }, { status: 400 });
  }
  const data = { status };
  if (status === "enviando") data.iniciadoEm = new Date();
  const campanha = await prisma.campanhaMassa.update({ where: { id }, data });
  return NextResponse.json(campanha);
}

export async function DELETE(_req, { params }) {
  const { id } = await params;
  await prisma.campanhaMassa.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
