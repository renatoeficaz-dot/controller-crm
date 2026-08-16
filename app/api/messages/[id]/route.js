import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { negarSeNaoPodeVerContato } from "@/lib/contatoAcesso";
import { lerCorpo, ehNaoEncontrado, respostaNaoEncontrado } from "@/lib/corpo";

// "Apagar" (item 88) só some da NOSSA visualização — sem API confiável de
// "apagar dos dois lados" testável sem acesso ao provedor ao vivo.
export async function PATCH(req, { params }) {
  try {
    const { id } = await params;
    // Sem isso dava pra apagar mensagem da conversa de um lead de outra pessoa,
    // só chutando/observando o id da mensagem.
    const atual = await prisma.message.findUnique({ where: { id }, select: { contactId: true } });
    if (!atual) return NextResponse.json({ error: "Não encontrada" }, { status: 404 });
    const negado = await negarSeNaoPodeVerContato(atual.contactId);
    if (negado) return negado;
  
    const { apagada } = await lerCorpo(req);
    const message = await prisma.message.update({ where: { id }, data: { apagada: !!apagada } });
    return NextResponse.json(message);
  } catch (err) {
    // Registro do `where` não existe (link velho, dois cliques, id
    // chutado): é "não achei", não erro de servidor.
    if (ehNaoEncontrado(err)) return respostaNaoEncontrado();
    throw err;
  }
}
