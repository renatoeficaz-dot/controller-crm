import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { ehNaoEncontrado, respostaNaoEncontrado } from "@/lib/corpo";
import { getCurrentUser, isAdmin } from "@/lib/session";

export async function DELETE(_req, { params }) {
  try {
    const { id } = await params;
    // Só apaga a própria visão; a compartilhada (usuario null), só o admin. Antes qualquer um apagava a de qualquer pessoa pelo id.
    const user = await getCurrentUser();
    const v = await prisma.visaoSalva.findUnique({ where: { id }, select: { usuario: true } });
    if (!v) return respostaNaoEncontrado();
    if (!isAdmin(user) && v.usuario !== user?.name) return NextResponse.json({ error: "Essa visão não é sua." }, { status: 403 });
    await prisma.visaoSalva.delete({ where: { id } }).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Registro do `where` não existe (link velho, dois cliques, id
    // chutado): é "não achei", não erro de servidor.
    if (ehNaoEncontrado(err)) return respostaNaoEncontrado();
    throw err;
  }
}
