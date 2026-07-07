import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { respondWithIa } from "@/app/api/webhook/evolution/route";

// Endpoint temporário: reprocessa a última mensagem recebida de um contato
// (uso único, pra destravar conversas que ficaram sem resposta por causa do
// bug do documento sem legenda, corrigido antes deste deploy). Remover depois.
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const phone = searchParams.get("phone");
  if (!phone) return NextResponse.json({ error: "informe ?phone=" }, { status: 400 });

  const contact = await prisma.contact.findFirst({ where: { phone: { endsWith: phone.slice(-8) } } });
  if (!contact) return NextResponse.json({ error: "contato não encontrado" }, { status: 404 });

  const lastIncoming = await prisma.message.findFirst({
    where: { contactId: contact.id, fromMe: false },
    orderBy: { createdAt: "desc" },
  });
  if (!lastIncoming) return NextResponse.json({ error: "sem mensagem recebida" }, { status: 404 });

  await respondWithIa(contact, lastIncoming, lastIncoming.instance, null);
  return NextResponse.json({ ok: true, contactId: contact.id, lastIncomingId: lastIncoming.id });
}
