import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { ehNaoEncontrado, respostaNaoEncontrado } from "@/lib/corpo";

// Remove a meta de um dia específico — o dia volta a usar a meta do dia da
// semana / global normalmente.
export async function DELETE(_req, { params }) {
  try {
    const { id } = await params;
    await prisma.metaVendasData.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (ehNaoEncontrado(err)) return respostaNaoEncontrado();
    throw err;
  }
}
