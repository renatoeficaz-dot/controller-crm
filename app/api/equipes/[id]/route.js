import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { lerCorpo, ehNaoEncontrado, respostaNaoEncontrado, texto, nomeMuitoLongo } from "@/lib/corpo";

const SELECT = {
  id: true,
  nome: true,
  metaVendasMinima: true,
  metaVendasMedia: true,
  metaVendasDia: true,
  metaPctRecebimentoMinima: true,
  metaPctRecebimentoMedia: true,
  metaPctRecebimento: true,
  membros: { select: { id: true, name: true } },
  createdAt: true,
};

export async function PATCH(req, { params }) {
  try {
    const { id } = await params;
    const body = await lerCorpo(req);
    const data = {};
    if ("nome" in body) {
      const nome = texto(body.nome);
      if (!nome) return NextResponse.json({ error: "Nome não pode ficar vazio." }, { status: 400 });
      if (nomeMuitoLongo(nome)) return NextResponse.json({ error: "Nome muito longo." }, { status: 400 });
      const outra = await prisma.equipe.findUnique({ where: { nome } });
      if (outra && outra.id !== id) return NextResponse.json({ error: "Já existe uma equipe com esse nome." }, { status: 409 });
      data.nome = nome;
    }
    // Teto pro mesmo bug de corrupção de linha (Int no schema) já corrigido em
    // /api/config, /api/users/[id], /api/regras-cobranca e /api/numbers/[id].
    const num = (v) => {
      if (v === "" || v == null) return null;
      const n = Math.round(Number(v));
      return Number.isFinite(n) ? Math.min(100000, Math.max(0, n)) || null : null;
    };
    for (const campo of ["metaVendasMinima", "metaVendasMedia", "metaVendasDia", "metaPctRecebimentoMinima", "metaPctRecebimentoMedia", "metaPctRecebimento"]) {
      if (campo in body) data[campo] = num(body[campo]);
    }
    if ("membrosIds" in body) {
      data.membros = { set: (body.membrosIds || []).map((mid) => ({ id: mid })) };
    }
    const equipe = await prisma.equipe.update({ where: { id }, data, select: SELECT });
    return NextResponse.json(equipe);
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
    await prisma.equipe.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Registro do `where` não existe (link velho, dois cliques, id
    // chutado): é "não achei", não erro de servidor.
    if (ehNaoEncontrado(err)) return respostaNaoEncontrado();
    throw err;
  }
}
