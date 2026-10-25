import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { lerCorpo, ehNaoEncontrado, respostaNaoEncontrado } from "@/lib/corpo";
import { dadosChip } from "@/lib/chips";

export async function PATCH(req, { params }) {
  try {
    const { id } = await params;
    const body = await lerCorpo(req);
    const { data, erro } = dadosChip(body, true);
    if (erro) return NextResponse.json({ error: erro }, { status: 400 });
    const chip = await prisma.chip.update({ where: { id }, data });
    return NextResponse.json(chip);
  } catch (err) {
    if (ehNaoEncontrado(err)) return respostaNaoEncontrado();
    throw err;
  }
}

export async function DELETE(_req, { params }) {
  try {
    const { id } = await params;
    await prisma.chip.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (ehNaoEncontrado(err)) return respostaNaoEncontrado();
    throw err;
  }
}
