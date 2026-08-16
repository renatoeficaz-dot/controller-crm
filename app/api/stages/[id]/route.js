import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { lerCorpo, ehNaoEncontrado, respostaNaoEncontrado } from "@/lib/corpo";

// Edita uma etapa (ex.: nome, cor, responsável automático)
export async function PATCH(req, { params }) {
  try {
    const { id } = await params;
    const body = await lerCorpo(req);
    const data = {};
    if ("name" in body) data.name = (body.name || "").trim();
    if ("color" in body) data.color = body.color || "#64748b";
    if ("autoResponsavel" in body) data.autoResponsavel = body.autoResponsavel || null;
    if ("distribuicaoPool" in body) data.distribuicaoPool = body.distribuicaoPool || null;
    const stage = await prisma.stage.update({ where: { id }, data });
    return NextResponse.json(stage);
  } catch (err) {
    // Registro do `where` não existe (link velho, dois cliques, id
    // chutado): é "não achei", não erro de servidor.
    if (ehNaoEncontrado(err)) return respostaNaoEncontrado();
    throw err;
  }
}

// Remove uma etapa
export async function DELETE(_req, { params }) {
  try {
    const { id } = await params;
    await prisma.stage.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Registro do `where` não existe (link velho, dois cliques, id
    // chutado): é "não achei", não erro de servidor.
    if (ehNaoEncontrado(err)) return respostaNaoEncontrado();
    throw err;
  }
}
