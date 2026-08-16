import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { lerCorpo } from "@/lib/corpo";

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
  const body = await lerCorpo(req);
  if (!body.contactId || !body.numeroId || !body.dataHora) {
    return NextResponse.json({ error: "Lead, número e data/hora são obrigatórios." }, { status: 400 });
  }
  if (!body.templateId && !body.corpo?.trim()) {
    return NextResponse.json({ error: "Escolha uma mensagem pronta ou escreva o texto." }, { status: 400 });
  }
  if (Number.isNaN(new Date(body.dataHora).getTime())) {
    return NextResponse.json({ error: "Data e hora inválidas." }, { status: 400 });
  }
  // Lead ou número inexistente estourava a chave estrangeira no Prisma e
  // voltava como erro 500, sem dizer o que estava errado.
  const [contatoOk, numeroOk] = await Promise.all([
    prisma.contact.count({ where: { id: body.contactId } }),
    prisma.whatsappNumber.count({ where: { id: body.numeroId } }),
  ]);
  if (!contatoOk) return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });
  if (!numeroOk) return NextResponse.json({ error: "Número de WhatsApp não encontrado." }, { status: 404 });
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
