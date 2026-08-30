import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { normalizeBrPhone } from "@/lib/evolution";
import { negarSeNaoPodeVerContato } from "@/lib/contatoAcesso";
import { lerCorpo, ehNaoEncontrado, respostaNaoEncontrado, texto } from "@/lib/corpo";
import { getCurrentUser } from "@/lib/session";

// Edita um contato de referência — só admin, mesma regra do POST em
// app/api/contacts/[id]/referencias/route.js.
export async function PATCH(req, { params }) {
  try {
    const { id } = await params;
    // A referência não tem dono próprio — o acesso é o do LEAD dela. Sem essa
    // checagem, qualquer usuário logado editava referência de qualquer lead
    // só sabendo (ou chutando) o id.
    const ref = await prisma.contatoReferencia.findUnique({ where: { id }, select: { contactId: true } });
    if (!ref) return respostaNaoEncontrado();
    const negado = await negarSeNaoPodeVerContato(ref.contactId);
    if (negado) return negado;
    const user = await getCurrentUser();
    if (user?.role !== "admin") return NextResponse.json({ error: "Só admin pode editar contato de referência." }, { status: 403 });

    const body = await lerCorpo(req);
    const data = {};
    if ("nome" in body) {
      const nome = texto(body.nome);
      if (!nome) return NextResponse.json({ error: "Nome não pode ficar vazio." }, { status: 400 });
      if (nome.length > 200) return NextResponse.json({ error: "Nome muito longo." }, { status: 400 });
      data.nome = nome;
    }
    if ("telefone" in body) {
      const telefoneRaw = texto(body.telefone);
      if (!telefoneRaw) return NextResponse.json({ error: "Telefone não pode ficar vazio." }, { status: 400 });
      data.telefone = normalizeBrPhone(telefoneRaw) || telefoneRaw.replace(/\D/g, "");
    }
    if ("relacao" in body) data.relacao = body.relacao || null;
    if ("dataNascimento" in body) data.dataNascimento = texto(body.dataNascimento).slice(0, 20) || null;
    if ("conferido" in body) data.conferido = !!body.conferido;

    const referencia = await prisma.contatoReferencia.update({ where: { id }, data });
    return NextResponse.json(referencia);
  } catch (err) {
    // Registro do `where` não existe (link velho, dois cliques, id
    // chutado): é "não achei", não erro de servidor.
    if (ehNaoEncontrado(err)) return respostaNaoEncontrado();
    throw err;
  }
}

// Remove um contato de referência — só admin.
export async function DELETE(_req, { params }) {
  try {
    const { id } = await params;
    const ref = await prisma.contatoReferencia.findUnique({ where: { id }, select: { contactId: true } });
    if (!ref) return respostaNaoEncontrado();
    const negado = await negarSeNaoPodeVerContato(ref.contactId);
    if (negado) return negado;
    const user = await getCurrentUser();
    if (user?.role !== "admin") return NextResponse.json({ error: "Só admin pode remover contato de referência." }, { status: 403 });

    await prisma.contatoReferencia.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Registro do `where` não existe (link velho, dois cliques, id
    // chutado): é "não achei", não erro de servidor.
    if (ehNaoEncontrado(err)) return respostaNaoEncontrado();
    throw err;
  }
}
