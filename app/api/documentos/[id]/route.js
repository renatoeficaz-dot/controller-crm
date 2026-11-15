import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { lerCorpo, ehNaoEncontrado, respostaNaoEncontrado } from "@/lib/corpo";
import { negarSeNaoPodeVerContato } from "@/lib/contatoAcesso";
import { registrarAuditoria } from "@/lib/auditoria";

// Documento é do cliente: só mexe quem pode ver o cliente (antes qualquer usuário logado apagava o RG de qualquer lead pelo id).
async function negarDoc(id) {
  const d = await prisma.documento.findUnique({ where: { id }, select: { contactId: true, tipo: true, fileName: true } });
  if (!d) return { resp: respostaNaoEncontrado() };
  const negado = await negarSeNaoPodeVerContato(d.contactId);
  return negado ? { resp: negado } : { doc: d };
}

export async function PATCH(req, { params }) {
  try {
    const { id } = await params;
    const { resp } = await negarDoc(id);
    if (resp) return resp;
    const user = await getCurrentUser();
    const { tipo, conferido } = await lerCorpo(req);
  
    const data = {};
    if (tipo) data.tipo = tipo;
    if (conferido != null) {
      data.conferido = !!conferido;
      data.conferidoPor = conferido ? user?.name || null : null;
      data.conferidoEm = conferido ? new Date() : null;
    }
  
    const documento = await prisma.documento.update({ where: { id }, data });
    return NextResponse.json(documento);
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
    const { resp, doc } = await negarDoc(id);
    if (resp) return resp;
    await prisma.documento.delete({ where: { id } }).catch(() => {});
    // Apagar documento de cliente não deixava rastro nenhum.
    const user = await getCurrentUser();
    registrarAuditoria({ usuario: user?.name, acao: "excluir_documento", entidade: "Contact", entidadeId: doc.contactId, detalhe: `${doc.tipo || "documento"} ${doc.fileName || ""}`.trim() });
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Registro do `where` não existe (link velho, dois cliques, id
    // chutado): é "não achei", não erro de servidor.
    if (ehNaoEncontrado(err)) return respostaNaoEncontrado();
    throw err;
  }
}
