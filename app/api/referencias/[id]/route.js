import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { normalizeBrPhone } from "@/lib/evolution";
import { lerCorpo, ehNaoEncontrado, respostaNaoEncontrado, texto } from "@/lib/corpo";

// Edita um contato de referência
export async function PATCH(req, { params }) {
  try {
    const { id } = await params;
    const body = await lerCorpo(req);
    const data = {};
    if ("nome" in body) {
      const nome = texto(body.nome);
      if (!nome) return NextResponse.json({ error: "Nome não pode ficar vazio." }, { status: 400 });
      data.nome = nome;
    }
    if ("telefone" in body) {
      const telefoneRaw = texto(body.telefone);
      if (!telefoneRaw) return NextResponse.json({ error: "Telefone não pode ficar vazio." }, { status: 400 });
      data.telefone = normalizeBrPhone(telefoneRaw) || telefoneRaw.replace(/\D/g, "");
    }
    if ("relacao" in body) data.relacao = body.relacao || null;
  
    const referencia = await prisma.contatoReferencia.update({ where: { id }, data });
    return NextResponse.json(referencia);
  } catch (err) {
    // Registro do `where` não existe (link velho, dois cliques, id
    // chutado): é "não achei", não erro de servidor.
    if (ehNaoEncontrado(err)) return respostaNaoEncontrado();
    throw err;
  }
}

// Remove um contato de referência
export async function DELETE(_req, { params }) {
  try {
    const { id } = await params;
    await prisma.contatoReferencia.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Registro do `where` não existe (link velho, dois cliques, id
    // chutado): é "não achei", não erro de servidor.
    if (ehNaoEncontrado(err)) return respostaNaoEncontrado();
    throw err;
  }
}
