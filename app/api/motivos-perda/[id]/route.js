import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { ehNaoEncontrado, respostaNaoEncontrado, lerCorpo } from "@/lib/corpo";

export async function PATCH(req, { params }) {
  try {
    const { id } = await params;
    const { templateId } = await lerCorpo(req);
    const atualizado = await prisma.motivoPerda.update({
      where: { id },
      data: { templateId: templateId || null },
      include: { template: { select: { id: true, title: true } } },
    });
    return NextResponse.json(atualizado);
  } catch (err) {
    if (ehNaoEncontrado(err)) return respostaNaoEncontrado();
    throw err;
  }
}

export async function DELETE(_req, { params }) {
  try {
    const { id } = await params;
    await prisma.motivoPerda.delete({ where: { id } }).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Registro do `where` não existe (link velho, dois cliques, id
    // chutado): é "não achei", não erro de servidor.
    if (ehNaoEncontrado(err)) return respostaNaoEncontrado();
    throw err;
  }
}
