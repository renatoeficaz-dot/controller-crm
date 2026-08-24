import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { normalizeBrPhone } from "@/lib/evolution";
import { negarSeNaoPodeVerContato } from "@/lib/contatoAcesso";
import { lerCorpo, texto } from "@/lib/corpo";
import { getCurrentUser } from "@/lib/session";

// Lista os contatos de referência (item 73) de um lead
export async function GET(_req, { params }) {
  const { id } = await params;
  const negado = await negarSeNaoPodeVerContato(id);
  if (negado) return negado;
  const referencias = await prisma.contatoReferencia.findMany({
    where: { contactId: id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(referencias);
}

// Adiciona um contato de referência — só admin, são dados sensíveis de
// terceiros (não do próprio lead), pedido explícito do Renato.
export async function POST(req, { params }) {
  const { id } = await params;
  const negado = await negarSeNaoPodeVerContato(id);
  if (negado) return negado;
  const user = await getCurrentUser();
  if (user?.role !== "admin") return NextResponse.json({ error: "Só admin pode cadastrar contato de referência." }, { status: 403 });

  const body = await lerCorpo(req);
  const nome = texto(body.nome);
  const telefoneRaw = texto(body.telefone);
  if (!nome || !telefoneRaw) {
    return NextResponse.json({ error: "Preencha nome e telefone." }, { status: 400 });
  }
  if (nome.length > 200) {
    return NextResponse.json({ error: "Nome muito longo." }, { status: 400 });
  }
  const dataNascimento = texto(body.dataNascimento).slice(0, 20) || null;
  const telefone = normalizeBrPhone(telefoneRaw) || telefoneRaw.replace(/\D/g, "");
  const contact = await prisma.contact.findUnique({ where: { id }, select: { id: true } });
  if (!contact) return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });

  const referencia = await prisma.contatoReferencia.create({
    data: { contactId: id, nome, telefone, relacao: body.relacao || null, dataNascimento },
  });
  return NextResponse.json(referencia);
}
