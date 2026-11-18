import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { lerCorpo, ehNaoEncontrado, respostaNaoEncontrado, nomeMuitoLongo } from "@/lib/corpo";

export async function PATCH(req, { params }) {
  try {
    const { id } = await params;
    const { name, color, custoPorLead } = await lerCorpo(req);
    const data = {};
    if (name) {
      if (typeof name !== "string") return NextResponse.json({ error: "Nome inválido." }, { status: 400 }); // número derrubava no .trim()
      if (nomeMuitoLongo(name)) return NextResponse.json({ error: "Nome muito longo." }, { status: 400 });
      const outra = await prisma.tag.findFirst({ where: { name: name.trim(), NOT: { id } }, select: { id: true } });
      if (outra) return NextResponse.json({ error: "Já existe uma etiqueta com esse nome." }, { status: 409 });
      data.name = name.trim();
    }
    if (color && /^#[0-9a-fA-F]{6}$/.test(color)) data.color = color;
    if (custoPorLead !== undefined) {
      const v = custoPorLead === null || custoPorLead === "" ? null : Number(custoPorLead);
      if (v !== null && (!Number.isFinite(v) || v < 0 || v > 100000)) return NextResponse.json({ error: "Custo por lead inválido." }, { status: 400 });
      data.custoPorLead = v;
    }
    const tag = await prisma.tag.update({ where: { id }, data });
    return NextResponse.json(tag);
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
    await prisma.tag.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Registro do `where` não existe (link velho, dois cliques, id
    // chutado): é "não achei", não erro de servidor.
    if (ehNaoEncontrado(err)) return respostaNaoEncontrado();
    throw err;
  }
}
