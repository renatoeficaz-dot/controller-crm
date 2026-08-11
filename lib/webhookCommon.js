// Processamento de mensagem recebida, compartilhado entre os webhooks de
// TODOS os provedores (Evolution, WAHA, ...). Cada webhook só extrai os dados
// do formato específico do provedor e chama processIncomingMessage — toda a
// lógica de negócio (criar lead, auto-tag, mover etapa, IA) mora só aqui.
import { prisma } from "@/lib/prisma";
import { respondWithIa, moveContactStage, getIaConfig, detectarGeneroPorNome } from "@/lib/ia";
import { saveMediaBase64 } from "@/lib/mediaStorage";
import { ufFromPhone } from "@/lib/ddd";
import { enviarPerguntaGuiada, processarRespostaGuiada } from "@/lib/formularioGuiado";

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
  waMessageId, // id da mensagem no provedor, se disponível
}) {
  if (isGroup) return; // ignora grupos
  if (!number) return;
  if (!text && !media && !location) return; // nada que saibamos exibir

  // Evolution/WAHA reentregam o mesmo webhook em retry de rede (timeout,
  // instabilidade) — sem essa checagem a mensagem era processada de novo e a
  // IA respondia duplicado pro cliente.
  if (waMessageId) {
    const jaExiste = await prisma.message.findUnique({ where: { waMessageId } });
    if (jaExiste) return;
  }

  // Tag de rastreio injetada pelo redirecionamento /l/[slug] (link de UTM) na
  // mensagem pré-preenchida do WhatsApp — some do texto visível, só fica
  // guardada como atribuição (campanhaId) na criação do lead.
  let campanhaSlug = null;
  if (text) {
    const m = text.match(/\[ref:([a-z0-9-]+)\]/i);
    if (m) {
      campanhaSlug = m[1];
      text = text.replace(m[0], "").trim();
    }
  }

  const tail = number.slice(-8);
  const lockResult = await withPhoneLock(tail, async () => {
    // Prefere sempre um cadastro ATIVO. Antes a busca não olhava `excluidoEm`,
    // então a mensagem era grudada num lead excluído: ela não aparecia no Chat
    // nem no funil (as duas telas filtram excluídos) e em 24h a purga apagava
    // o lead junto com tudo que o cliente tinha escrito. Ninguém via.
    let contact = await prisma.contact.findFirst({ where: { phone: { endsWith: tail }, excluidoEm: null } });
    if (!contact) {
      const excluido = await prisma.contact.findFirst({
        where: { phone: { endsWith: tail }, excluidoEm: { not: null } },
        orderBy: { excluidoEm: "desc" },
      });
      // Cliente voltou a escrever dentro da janela de desfazer: restaura em vez
      // de criar um cadastro novo (perderia o histórico) ou de engolir a
      // mensagem. Fica registrado na auditoria pra ninguém achar que "voltou
      // sozinho".
      if (excluido) {
        contact = await prisma.contact.update({ where: { id: excluido.id }, data: { excluidoEm: null } });
        prisma.auditLog
          .create({
            data: {
              acao: "restaurar_contato",
              entidade: "Contact",
              entidadeId: contact.id,
              detalhe: `${contact.name || number} voltou a mandar mensagem e foi restaurado automaticamente`,
            },
          })
          .catch(() => {});
      }
    }

    // Mensagem enviada por nós direto pelo celular (fora do CRM): só registra se o
    // contato já existir — não cria lead novo nem aplica auto-tag por isso.
    if (fromMe && !contact) return { stop: true };

    if (!contact) {
      const first = await prisma.stage.findFirst({ orderBy: { order: "asc" } });
      if (!first) return { stop: true };
      let campanhaId = null;
      if (campanhaSlug) {
        const campanha = await prisma.linkCampanha.findUnique({ where: { slug: campanhaSlug } });
        if (campanha) campanhaId = campanha.id;
      }
      let campanha = null;
      if (campanhaId) campanha = await prisma.linkCampanha.findUnique({ where: { id: campanhaId } });
      const iniciaGuiado = campanha?.modoColeta === "perguntar";

      contact = await prisma.contact.create({
        data: {
          name: pushName || number, phone: number, stageId: first.id, estado: ufFromPhone(number), campanhaId,
          formularioEmAndamento: iniciaGuiado,
        },
      });

      if (iniciaGuiado) {
        await enviarPerguntaGuiada(contact, campanha, instance).catch(() => {});
        return { contact, guiadoIniciadoAgora: true };
      }

      // Gênero pelo nome (IA, uma vez só) — não bloqueia a criação do lead.
      if (pushName) {
        getIaConfig()
          .then((cfg) => detectarGeneroPorNome(pushName, cfg?.deepinfraApiKey))
          .then((genero) => {
            if (genero) return prisma.contact.update({ where: { id: contact.id }, data: { genero } });
          })
          .catch(() => {});
      }

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
  const { contact, guiadoIniciadoAgora } = lockResult;

  // Monta a mensagem (texto ou mídia)
  const msg = fromMe
    ? { contactId: contact.id, fromMe: true, status: "enviado", instance, waMessageId: waMessageId || null }
    : { contactId: contact.id, fromMe: false, status: "recebido", instance, waMessageId: waMessageId || null };
  let incomingAudio = null;
  if (media) {
    // Uma segunda tentativa antes de desistir: o download falhava por timeout
    // passageiro do provedor e a mídia era descartada pra sempre (virava só um
    // texto "não foi possível baixar"), sem forma de recuperar depois.
    let file = downloadMedia ? await downloadMedia().catch(() => null) : null;
    if (downloadMedia && !file?.base64) {
      await new Promise((r) => setTimeout(r, 1500));
      file = await downloadMedia().catch(() => null);
    }
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

  // Já mandamos a 1ª pergunta do formulário guiado na criação do lead, acima
  // — essa mensagem que acabou de chegar é a saudação inicial dele, não uma
  // resposta a nada ainda. Não passa pela automação normal nesse turno.
  if (guiadoIniciadoAgora) return;

  // Preenchimento guiado em andamento: essa mensagem é a resposta da pergunta
  // atual. Consome aqui e não deixa cair na automação normal/IA.
  if (!fromMe && msg.kind === "text" && contact.formularioEmAndamento) {
    const consumida = await processarRespostaGuiada(contact, text, instance).catch(() => false);
    if (consumida) return;
  }

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
