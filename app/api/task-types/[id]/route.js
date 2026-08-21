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
    if ("color" in body && /^#[0-9a-fA-F]{6}$/.test(body.color || "")) data.color = body.color;
    if ("emoji" in body) data.emoji = typeof body.emoji === "string" ? body.emoji.slice(0, 8) || null : null;
    const tipo = await prisma.taskType.update({ where: { id }, data });
    return NextResponse.json(tipo);
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
    await prisma.taskType.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Registro do `where` não existe (link velho, dois cliques, id
    // chutado): é "não achei", não erro de servidor.
    if (ehNaoEncontrado(err)) return respostaNaoEncontrado();
    throw err;
  }
}
