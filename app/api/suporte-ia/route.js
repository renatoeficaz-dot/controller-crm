import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { negarSeNaoPodeVerContato } from "@/lib/contatoAcesso";
import { lerCorpo } from "@/lib/corpo";

// Fila do botão vermelho de "erro da IA" (ver schema.prisma). Só admin lista
// (é revisão de prompt/lógica, não faz parte do atendimento do dia a dia);
// qualquer usuário logado pode reportar, é durante o próprio atendimento.
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Só administrador." }, { status: 403 });
  }
  const itens = await prisma.suporteIa.findMany({
    orderBy: { createdAt: "desc" },
    include: { contact: { select: { id: true, name: true, phone: true } } },
  });
  return NextResponse.json(itens);
}

export async function POST(req) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { contactId, descricao } = await lerCorpo(req);
  if (!contactId) return NextResponse.json({ error: "Informe o contato." }, { status: 400 });
  const negado = await negarSeNaoPodeVerContato(contactId);
  if (negado) return negado;
  const item = await prisma.suporteIa.create({
    data: { contactId, descricao: descricao?.trim() || null, criadoPor: user.name },
  });
  return NextResponse.json(item);
}
