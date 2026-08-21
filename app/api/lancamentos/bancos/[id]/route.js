import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { lerCorpo, texto, ehNaoEncontrado, respostaNaoEncontrado, nomeMuitoLongo } from "@/lib/corpo";

export async function PATCH(req, { params }) {
  try {
    const { id } = await params;
    const body = await lerCorpo(req);
    const name = texto(body.name);
    if (!name) return NextResponse.json({ error: "Nome não pode ficar vazio." }, { status: 400 });
    if (nomeMuitoLongo(name)) return NextResponse.json({ error: "Nome muito longo." }, { status: 400 });
    const banco = await prisma.banco.update({ where: { id }, data: { name } });
    return NextResponse.json(banco);
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
    await prisma.banco.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Registro do `where` não existe (link velho, dois cliques, id
    // chutado): é "não achei", não erro de servidor.
    if (ehNaoEncontrado(err)) return respostaNaoEncontrado();
    throw err;
  }
}
