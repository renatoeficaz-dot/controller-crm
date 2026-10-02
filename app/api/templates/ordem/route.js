import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { lerCorpo } from "@/lib/corpo";

// Grava a nova ordem das mensagens prontas: a posição na lista vira o `order`.
export async function POST(req) {
  const { ids } = await lerCorpo(req);
  if (!Array.isArray(ids) || !ids.length || ids.some((i) => typeof i !== "string")) {
    return NextResponse.json({ error: "Lista de ids inválida." }, { status: 400 });
  }
  await prisma.$transaction(
    ids.map((id, i) => prisma.messageTemplate.updateMany({ where: { id }, data: { order: i } }))
  );
  return NextResponse.json({ ok: true });
}
