import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { contarAlvos } from "@/lib/campanhaMassa";
import { lerCorpo } from "@/lib/corpo";

export async function GET() {
  const lista = await prisma.campanhaMassa.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  return NextResponse.json(lista);
}

// Cria em rascunho — o disparo real só começa quando PATCH status="enviando".
// Assim dá pra conferir "totalAlvos" antes de mandar de verdade.
export async function POST(req) {
  const user = await getCurrentUser();
  const body = await lerCorpo(req);
  if (!body.nome?.trim() || !body.numeroId) {
    return NextResponse.json({ error: "Nome e número de envio são obrigatórios." }, { status: 400 });
  }
  if (!body.templateId && !body.mensagem?.trim()) {
    return NextResponse.json({ error: "Escolha uma mensagem pronta ou escreva o texto." }, { status: 400 });
  }
  const filtros = JSON.stringify(body.filtros || {});
  const totalAlvos = await contarAlvos(body.filtros || {});

  const criada = await prisma.campanhaMassa.create({
    data: {
      nome: body.nome.trim(),
      filtros,
      templateId: body.templateId || null,
      mensagem: body.templateId ? null : body.mensagem.trim(),
      numeroId: body.numeroId,
      totalAlvos,
      criadoPor: user?.name || null,
    },
  });
  return NextResponse.json(criada);
}
