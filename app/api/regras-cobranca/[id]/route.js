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
    if ("mensagem" in body) {
      // Mensagem em branco era aceita e a régua mandava mensagem VAZIA para o cliente.
      if (!texto(body.mensagem)) return NextResponse.json({ error: "A mensagem da faixa não pode ficar vazia." }, { status: 400 });
      data.mensagem = texto(body.mensagem);
    }
    if ("ativa" in body) data.ativa = !!body.ativa;
    if ("ordem" in body) data.ordem = clamp(body.ordem);
    if ("canalSugerido" in body) data.canalSugerido = texto(body.canalSugerido) || null;
    // Faixa invertida (máximo menor que o mínimo) nunca casava com nenhum atraso e a régua parava de cobrar essa faixa sem avisar.
    if ("diasMin" in data || "diasMax" in data) {
      const atual = await prisma.regraCobranca.findUnique({ where: { id }, select: { diasMin: true, diasMax: true } });
      const min = "diasMin" in data ? data.diasMin : atual?.diasMin;
      const max = "diasMax" in data ? data.diasMax : atual?.diasMax;
      if (max != null && min != null && max < min) return NextResponse.json({ error: "O dia máximo não pode ser menor que o mínimo." }, { status: 400 });
    }
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
