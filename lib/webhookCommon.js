// Processamento de mensagem recebida, compartilhado entre os webhooks de
// TODOS os provedores (Evolution, WAHA, ...). Cada webhook só extrai os dados
// do formato específico do provedor e chama processIncomingMessage — toda a
// lógica de negócio (criar lead, auto-tag, mover etapa, IA) mora só aqui.
import { prisma } from "@/lib/prisma";
import { respondWithIa, moveContactStage } from "@/lib/ia";
import { saveMediaBase64 } from "@/lib/mediaStorage";

// Serializa a busca+criação de contato por telefone: se duas mensagens do
// mesmo número chegam quase juntas, as duas requisições rodavam o "findFirst"
// em paralelo e criavam um lead duplicado. Isso enfileira as requisições do
// MESMO telefone (não trava as de números diferentes).
const contactLocks = new Map();
function withPhoneLock(tail, fn) {
  const prev = contactLocks.get(tail) || Promise.resolve();
  const result = prev.then(fn, fn);
  const cleanup = result.then(() => {}, () => {});
  contactLocks.set(tail, cleanup);
  cleanup.finally(() => {
    if (contactLocks.get(tail) === cleanup) contactLocks.delete(tail);
  });
  return result;
}

// `downloadMedia` (opcional): async () => { base64, mimetype, fileName } | null
export async function processIncomingMessage({
  instance,
  fromMe,
  isGroup,
  number,
  pushName,
  text,
  media, // { kind, mimetype, caption, fileName } | null
  location, // { url, label } | null
  downloadMedia,
}) {
  if (isGroup) return; // ignora grupos
  if (!number) return;
  if (!text && !media && !location) return; // nada que saibamos exibir

  const tail = number.slice(-8);
  const lockResult = await withPhoneLock(tail, async () => {
    let contact = await prisma.contact.findFirst({ where: { phone: { endsWith: tail } } });

    // Mensagem enviada por nós direto pelo celular (fora do CRM): só registra se o
    // contato já existir — não cria lead novo nem aplica auto-tag por isso.
    if (fromMe && !contact) return { stop: true };

    if (!contact) {
      const first = await prisma.stage.findFirst({ orderBy: { order: "asc" } });
      if (!first) return { stop: true };
      contact = await prisma.contact.create({
        data: { name: pushName || number, phone: number, stageId: first.id },
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
    return { contact };
  });
  if (lockResult.stop) return;
  const { contact } = lockResult;

  // Monta a mensagem (texto ou mídia)
  const msg = fromMe
    ? { contactId: contact.id, fromMe: true, status: "enviado", instance }
    : { contactId: contact.id, fromMe: false, status: "recebido", instance };
  let incomingAudio = null;
  if (media) {
    const file = downloadMedia ? await downloadMedia() : null;
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
      msg.kind = "text";
      msg.body = media.caption || `[${media.kind} recebido — não foi possível baixar o arquivo]`;
    }
  } else if (location) {
    msg.kind = "location";
    msg.body = location.label ? `${location.label}\n${location.url}` : location.url;
  } else {
    msg.kind = "text";
    msg.body = text;
  }

  const saved = await prisma.message.create({ data: msg });

  // Cliente mandou o primeiro documento/foto de verdade nesta conversa: move
  // automaticamente pra "Documentação". Só avança (nunca move pra trás).
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

  // IA livre (DeepInfra/Llama): só reage a mensagens recebidas do cliente.
  if (!fromMe && !contact.iaPausada) {
    await respondWithIa(contact, saved, instance, incomingAudio).catch(() => {});
  }
}
