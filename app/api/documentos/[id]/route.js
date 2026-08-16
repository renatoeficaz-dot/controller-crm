import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { lerCorpo, ehNaoEncontrado, respostaNaoEncontrado } from "@/lib/corpo";

export async function PATCH(req, { params }) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    const { tipo, conferido } = await lerCorpo(req);
  
    const data = {};
    if (tipo) data.tipo = tipo;
    if (conferido != null) {
      data.conferido = !!conferido;
      data.conferidoPor = conferido ? user?.name || null : null;
      data.conferidoEm = conferido ? new Date() : null;
    }
  
    const documento = await prisma.documento.update({ where: { id }, data });
    return NextResponse.json(documento);
  } catch (err) {
    // Registro do `where` não existe (link velho, dois cliques, id
    // chutado): é "não achei", não erro de servidor.
    if (ehNaoEncontrado(err)) return respostaNaoEncontrado();
    throw err;
  }
}

export async function DELETE(_req, { params }) {
  try {
    const { id } = await params;
    await prisma.documento.delete({ where: { id } }).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Registro do `where` não existe (link velho, dois cliques, id
    // chutado): é "não achei", não erro de servidor.
    if (ehNaoEncontrado(err)) return respostaNaoEncontrado();
    throw err;
  }
}
