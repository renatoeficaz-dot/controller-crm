import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(req) {
  const contactId = new URL(req.url).searchParams.get("contactId");
  const lista = await prisma.mensagemAgendada.findMany({
    where: contactId ? { contactId } : { enviado: false },
    orderBy: { dataHora: "asc" },
    include: { contact: { select: { id: true, name: true, phone: true } }, template: { select: { title: true } } },
    take: 200,
  });
  return NextResponse.json(lista);
}

export async function POST(req) {
  const body = await req.json();
  if (!body.contactId || !body.numeroId || !body.dataHora) {
    return NextResponse.json({ error: "Lead, número e data/hora são obrigatórios." }, { status: 400 });
  }
  if (!body.templateId && !body.corpo?.trim()) {
    return NextResponse.json({ error: "Escolha uma mensagem pronta ou escreva o texto." }, { status: 400 });
  }
  const criado = await prisma.mensagemAgendada.create({
    data: {
      contactId: body.contactId,
      numeroId: body.numeroId,
      templateId: body.templateId || null,
      corpo: body.templateId ? null : body.corpo.trim(),
      dataHora: new Date(body.dataHora),
    },
  });
  return NextResponse.json(criado);
}
