import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { negarSeNaoPodeVerContato } from "@/lib/contatoAcesso";
import { ehNaoEncontrado, respostaNaoEncontrado } from "@/lib/corpo";

export async function DELETE(_req, { params }) {
  try {
    const { id } = await params;
    // Sem isso dava pra mexer em mensagem agendada de um lead de outra
    // pessoa so trocando o id na URL — a checagem no /api/contacts nao cobre
    // essa rota, porque aqui a chave e a da propria entidade.
    const _e = await prisma.mensagemAgendada.findUnique({ where: { id }, select: { contactId: true } });
    if (!_e) return NextResponse.json({ error: "Mensagem agendada não encontrada." }, { status: 404 });
    const negado = await negarSeNaoPodeVerContato(_e.contactId);
    if (negado) return negado;
    await prisma.mensagemAgendada.delete({ where: { id } }).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Registro do `where` não existe (link velho, dois cliques, id
    // chutado): é "não achei", não erro de servidor.
    if (ehNaoEncontrado(err)) return respostaNaoEncontrado();
    throw err;
  }
}
