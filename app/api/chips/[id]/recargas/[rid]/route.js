import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { ehNaoEncontrado, respostaNaoEncontrado } from "@/lib/corpo";
import { sincronizarUltimaRecarga } from "@/lib/chips";

export async function DELETE(_req, { params }) {
  try {
    const { id, rid } = await params;
    await prisma.chipRecarga.deleteMany({ where: { id: rid, chipId: id } });
    await sincronizarUltimaRecarga(prisma, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (ehNaoEncontrado(err)) return respostaNaoEncontrado();
    throw err;
  }
}
