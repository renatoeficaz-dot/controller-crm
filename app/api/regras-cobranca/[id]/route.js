import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { lerCorpo, ehNaoEncontrado, respostaNaoEncontrado, texto } from "@/lib/corpo";

export async function PATCH(req, { params }) {
  try {
    const { id } = await params;
    const body = await lerCorpo(req);
    const data = {};
    // Mesmo teto do POST — sem ele, valor fora da faixa de 32 bits corrompe a
    // linha (Int no schema).
    const clamp = (v) => {
      const n = Math.round(Number(v));
      return Number.isFinite(n) ? Math.min(100000, Math.max(-100000, n)) : 0;
    };
    if ("diasMin" in body) data.diasMin = clamp(body.diasMin);
    if ("diasMax" in body) data.diasMax = body.diasMax === "" || body.diasMax == null ? null : clamp(body.diasMax);
    if ("mensagem" in body) data.mensagem = texto(body.mensagem);
    if ("ativa" in body) data.ativa = !!body.ativa;
    if ("ordem" in body) data.ordem = clamp(body.ordem);
    if ("canalSugerido" in body) data.canalSugerido = body.canalSugerido || null;
    const regra = await prisma.regraCobranca.update({ where: { id }, data });
    return NextResponse.json(regra);
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
    await prisma.regraCobranca.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Registro do `where` não existe (link velho, dois cliques, id
    // chutado): é "não achei", não erro de servidor.
    if (ehNaoEncontrado(err)) return respostaNaoEncontrado();
    throw err;
  }
}
