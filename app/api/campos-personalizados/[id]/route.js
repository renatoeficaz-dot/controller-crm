import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { ehNaoEncontrado, respostaNaoEncontrado } from "@/lib/corpo";

export async function DELETE(_req, { params }) {
  try {
    const { id } = await params;
    await prisma.campoPersonalizado.delete({ where: { id } }).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Registro do `where` não existe (link velho, dois cliques, id
    // chutado): é "não achei", não erro de servidor.
    if (ehNaoEncontrado(err)) return respostaNaoEncontrado();
    throw err;
  }
}
