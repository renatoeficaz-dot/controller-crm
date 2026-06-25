import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { extractIncomingText, onlyDigits } from "@/lib/evolution";

// Webhook da Evolution API: recebe mensagens que o cliente manda no WhatsApp.
// Configure na Evolution para apontar para:  <seu-dominio>/api/webhook/evolution
export async function POST(req) {
  const payload = await req.json().catch(() => null);
  if (!payload) return NextResponse.json({ ok: true });

  // Evolution v2 manda { event, instance, data: { key, message, pushName } }
  const event = payload.event || "";
  if (!event.includes("messages")) return NextResponse.json({ ok: true });

  const data = payload.data || {};
  const fromMe = data.key?.fromMe;
  if (fromMe) return NextResponse.json({ ok: true }); // ignora o eco das nossas próprias mensagens

  const remoteJid = data.key?.remoteJid || "";
  const number = onlyDigits(remoteJid.split("@")[0]);
  const text = extractIncomingText(data.message);
  if (!number || !text) return NextResponse.json({ ok: true });

  // Acha o contato pelo telefone (últimos 8 dígitos batem, pra tolerar formatações)
  const tail = number.slice(-8);
  let contact = await prisma.contact.findFirst({
    where: { phone: { endsWith: tail } },
  });

  // Se não existir, cria um lead novo na primeira coluna
  if (!contact) {
    const first = await prisma.stage.findFirst({ orderBy: { order: "asc" } });
    if (!first) return NextResponse.json({ ok: true });
    contact = await prisma.contact.create({
      data: {
        name: data.pushName || number,
        phone: number,
        stageId: first.id,
      },
    });
  }

  await prisma.message.create({
    data: { contactId: contact.id, body: text, fromMe: false, status: "recebido" },
  });

  return NextResponse.json({ ok: true });
}
