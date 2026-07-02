import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import {
  extractIncomingText,
  detectIncomingMedia,
  fetchIncomingMediaBase64,
  onlyDigits,
} from "@/lib/evolution";
import { handleChatbotMessage } from "@/lib/chatbot";

// Webhook da Evolution API: recebe mensagens que o cliente manda no WhatsApp.
// Configure na Evolution para apontar para:  <seu-dominio>/api/webhook/evolution
export async function POST(req) {
  const payload = await req.json().catch(() => null);
  if (!payload) return NextResponse.json({ ok: true });

  // Evolution v2 manda { event, instance, data: { key, message, pushName } }
  const event = payload.event || "";
  if (!event.includes("messages")) return NextResponse.json({ ok: true });

  const instance = payload.instance || "";
  const data = payload.data || {};
  const fromMe = Boolean(data.key?.fromMe);

  const remoteJid = data.key?.remoteJid || "";
  if (remoteJid.endsWith("@g.us")) return NextResponse.json({ ok: true }); // ignora grupos
  const number = onlyDigits(remoteJid.split("@")[0]);
  if (!number) return NextResponse.json({ ok: true });

  const text = extractIncomingText(data.message);
  const media = detectIncomingMedia(data.message); // áudio / imagem / documento / vídeo
  if (!text && !media) return NextResponse.json({ ok: true }); // nada que saibamos exibir

  // Acha o contato pelo telefone (últimos 8 dígitos batem, pra tolerar formatações)
  const tail = number.slice(-8);
  let contact = await prisma.contact.findFirst({
    where: { phone: { endsWith: tail } },
  });

  // Mensagem enviada por nós direto pelo celular (fora do CRM): só registra se o
  // contato já existir — não cria lead novo nem aplica auto-tag por isso.
  if (fromMe && !contact) return NextResponse.json({ ok: true });

  let isNewContact = false;
  // Se não existir (mensagem recebida de um contato novo), cria um lead na primeira coluna
  if (!contact) {
    isNewContact = true;
    const first = await prisma.stage.findFirst({ orderBy: { order: "asc" } });
    if (!first) return NextResponse.json({ ok: true });
    // Herda a ruta vinculada ao número (instância) que recebeu a mensagem
    const waNumber = instance
      ? await prisma.whatsappNumber.findFirst({ where: { instance } })
      : null;
    contact = await prisma.contact.create({
      data: {
        name: data.pushName || number,
        phone: number,
        stageId: first.id,
        unitId: waNumber?.unitId || null,
      },
    });

    // Auto-tag: se a 1ª mensagem conter um texto configurado, atribui a tag.
    const msgText = (text || "").toLowerCase();
    if (msgText) {
      const rules = await prisma.autoTagRule.findMany({ include: { tag: true } });
      const matched = rules.filter((r) => msgText.includes(r.match.toLowerCase()));
      if (matched.length) {
        await prisma.contact.update({
          where: { id: contact.id },
          data: { tags: { connect: matched.map((r) => ({ id: r.tagId })) } },
        });
      }
    }
  }

  // Monta a mensagem (texto ou mídia)
  const msg = fromMe
    ? { contactId: contact.id, fromMe: true, status: "enviado", instance }
    : { contactId: contact.id, fromMe: false, status: "recebido", instance };
  if (media) {
    const file = await fetchIncomingMediaBase64(instance, data.key);
    if (file?.base64) {
      const mime = file.mimetype || media.mimetype;
      msg.kind = media.kind;
      msg.body = media.caption || "";
      msg.mediaUrl = `data:${mime};base64,${file.base64}`;
      msg.mimeType = mime;
      msg.fileName = file.fileName || media.fileName || null;
    } else {
      // Não conseguiu baixar o arquivo: registra um aviso pra não perder a mensagem
      msg.kind = "text";
      msg.body = media.caption || `[${media.kind} recebido — não foi possível baixar o arquivo]`;
    }
  } else {
    msg.kind = "text";
    msg.body = text;
  }

  await prisma.message.create({ data: msg });

  // Chatbot: só reage a mensagens recebidas do cliente (não a ecos do nosso próprio envio)
  if (!fromMe) {
    await handleChatbotMessage(contact, text || "", isNewContact).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
