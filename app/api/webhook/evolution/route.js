import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import {
  extractIncomingText,
  detectIncomingMedia,
  extractIncomingLocation,
  fetchIncomingMediaBase64,
  onlyDigits,
} from "@/lib/evolution";
import { handleChatbotMessage } from "@/lib/chatbot";
import { respondWithIa, moveContactStage } from "@/lib/ia";
import { saveMediaBase64 } from "@/lib/mediaStorage";

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
  const location = extractIncomingLocation(data.message); // 📍 localização (lat/long, sem arquivo)
  if (!text && !media && !location) return NextResponse.json({ ok: true }); // nada que saibamos exibir

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
    contact = await prisma.contact.create({
      data: {
        name: data.pushName || number,
        phone: number,
        stageId: first.id,
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
  let incomingAudio = null; // { base64, mimetype } — guardado pra transcrever depois, se for o caso
  if (media) {
    const file = await fetchIncomingMediaBase64(instance, data.key);
    if (file?.base64) {
      const mime = file.mimetype || media.mimetype;
      const fileName = file.fileName || media.fileName || null;
      msg.kind = media.kind;
      msg.body = media.caption || "";
      msg.mediaUrl = await saveMediaBase64(file.base64, mime, fileName);
      msg.mimeType = mime;
      msg.fileName = fileName;
      if (media.kind === "audio") incomingAudio = { base64: file.base64, mimetype: mime };
    } else {
      // Não conseguiu baixar o arquivo: registra um aviso pra não perder a mensagem
      msg.kind = "text";
      msg.body = media.caption || `[${media.kind} recebido — não foi possível baixar o arquivo]`;
    }
  } else if (location) {
    // Localização não tem arquivo — guarda o link do Google Maps direto no corpo da mensagem
    msg.kind = "location";
    msg.body = location.label ? `${location.label}\n${location.url}` : location.url;
  } else {
    msg.kind = "text";
    msg.body = text;
  }

  const saved = await prisma.message.create({ data: msg });

  // Cliente mandou o primeiro documento/foto de verdade nesta conversa: move
  // automaticamente pra "Documentação". Só avança (nunca move pra trás quem
  // já passou dessa etapa, ex.: já está em Análise ou depois).
  if (!fromMe && (msg.kind === "image" || msg.kind === "document")) {
    const [currentStage, documentacao] = await Promise.all([
      prisma.stage.findUnique({ where: { id: contact.stageId } }),
      prisma.stage.findFirst({ where: { name: "Documentação" } }),
    ]);
    if (documentacao && currentStage && currentStage.order < documentacao.order) {
      await moveContactStage(contact.id, "Documentação", instance).catch(() => {});
    }
  }

  // Cliente mandando mensagem pra um número de cobrança (sem agente de IA
  // atribuído — atendido por humano) já está em contato direto com o
  // cobrador de verdade: move automaticamente pra "Liberação pagamento".
  // Só avança (nunca move pra trás quem já passou dessa etapa).
  if (!fromMe) {
    const numero = await prisma.whatsappNumber.findFirst({ where: { instance } });
    if (numero && !numero.agentId) {
      const [currentStage, liberacao] = await Promise.all([
        prisma.stage.findUnique({ where: { id: contact.stageId } }),
        prisma.stage.findFirst({ where: { name: "Liberação pagamento" } }),
      ]);
      if (liberacao && currentStage && currentStage.order < liberacao.order) {
        await moveContactStage(contact.id, "Liberação pagamento", instance).catch(() => {});
      }
    }
  }

  // Chatbot: só reage a mensagens recebidas do cliente (não a ecos do nosso próprio envio).
  // Atendimento manual (iaPausada) desliga tanto o chatbot em blocos quanto a IA livre.
  if (!fromMe && !contact.iaPausada) {
    const handled = await handleChatbotMessage(contact, text || "", isNewContact, instance).catch(() => false);

    // IA livre (DeepInfra/Llama): só entra se o fluxo por blocos não tratou a mensagem
    if (!handled) {
      await respondWithIa(contact, saved, instance, incomingAudio).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true });
}
