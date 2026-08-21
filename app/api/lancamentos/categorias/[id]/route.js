import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { lerCorpo, ehNaoEncontrado, respostaNaoEncontrado, texto, nomeMuitoLongo } from "@/lib/corpo";

export async function PATCH(req, { params }) {
  try {
    const { id } = await params;
    const body = await lerCorpo(req);
    const data = {};
    if ("name" in body) {
      const name = texto(body.name);
      if (!name) return NextResponse.json({ error: "Nome não pode ficar vazio." }, { status: 400 });
      if (nomeMuitoLongo(name)) return NextResponse.json({ error: "Nome muito longo." }, { status: 400 });
      data.name = name;
    }
    if ("type" in body && ["entrada", "saida"].includes(body.type)) data.type = body.type;
    const categoria = await prisma.lancamentoCategoria.update({ where: { id }, data });
    return NextResponse.json(categoria);
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
    await prisma.lancamentoCategoria.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Registro do `where` não existe (link velho, dois cliques, id
    // chutado): é "não achei", não erro de servidor.
    if (ehNaoEncontrado(err)) return respostaNaoEncontrado();
    throw err;
  }
}
