import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { sendWhatsappText } from "@/lib/evolution";

// Lista mensagens do contato
export async function GET(_req, { params }) {
  const { id } = await params;
  const messages = await prisma.message.findMany({
    where: { contactId: id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(messages);
}

// Envia mensagem pelo WhatsApp (Evolution API) e salva no histórico
export async function POST(req, { params }) {
  const { id } = await params;
  const { body } = await req.json();

  const contact = await prisma.contact.findUnique({ where: { id } });
  if (!contact) return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 });
  if (!body?.trim()) return NextResponse.json({ error: "Mensagem vazia" }, { status: 400 });

  const result = await sendWhatsappText(contact.phone, body);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  const message = await prisma.message.create({
    data: {
      contactId: id,
      body,
      fromMe: true,
      status: result.simulated ? "simulado" : "enviado",
    },
  });

  return NextResponse.json({ message, simulated: !!result.simulated });
}
