import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import {
  extractIncomingText,
  detectIncomingMedia,
  extractIncomingLocation,
  fetchIncomingMediaBase64,
  onlyDigits,
  sendWhatsappText,
  sendWhatsappAudio,
  sendPresence,
} from "@/lib/evolution";
import { handleChatbotMessage } from "@/lib/chatbot";
import { askIa, synthesizeSpeech, transcribeAudio, getIaConfig, getAgentForInstance, executeToolCalls, agentShouldStayQuiet, autoSendCobradorContact, analyzeDocumentImage, hasReceivedRealDocuments, hasReceivedVideoAndLocation } from "@/lib/ia";

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
      msg.kind = media.kind;
      msg.body = media.caption || "";
      msg.mediaUrl = `data:${mime};base64,${file.base64}`;
      msg.mimeType = mime;
      msg.fileName = file.fileName || media.fileName || null;
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

  // Chatbot: só reage a mensagens recebidas do cliente (não a ecos do nosso próprio envio)
  if (!fromMe) {
    const handled = await handleChatbotMessage(contact, text || "", isNewContact, instance).catch(() => false);

    // IA livre (DeepInfra/Llama): só entra se o fluxo por blocos não tratou a mensagem
    if (!handled) {
      await respondWithIa(contact, saved, instance, incomingAudio).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true });
}

// true se o texto parece uma lista/checklist (várias linhas com ✅, número
// ou marcador) — nesses casos manda o texto além do áudio, pra não obrigar
// o cliente a decorar uma lista só de ouvido.
function isListLike(text) {
  const lines = (text || "").split("\n");
  const listLines = lines.filter((l) => /^\s*(✅|[-*•]|\d+[.)])\s/.test(l));
  return listLines.length >= 2;
}

// Gera e envia a resposta da IA usando o histórico recente da conversa.
// - Só roda se o número (instância) que recebeu a mensagem tiver um agente atribuído.
// - Se a mensagem recebida for um áudio, transcreve (Whisper) pra IA entender.
// - O formato da resposta (texto ou áudio) segue o modo do agente:
//   "espelho" (acompanha o que o cliente mandou), "texto" ou "audio" (sempre).
async function respondWithIa(contact, incomingMsg, instance, incomingAudio) {
  const cfg = await getIaConfig();
  if (!cfg?.deepinfraApiKey) return;

  // Cada número escolhe seu próprio agente — sem agente atribuído, sem resposta.
  const agent = await getAgentForInstance(instance);
  if (!agent) return;
  const apiKey = cfg.deepinfraApiKey;

  // A partir da etapa configurada (ex.: "Liberação pagamento"), o atendimento
  // vira 100% humano — a IA para de responder esse lead.
  const currentStage = await prisma.stage.findUnique({ where: { id: contact.stageId } });
  if (agentShouldStayQuiet(agent, currentStage)) return;

  let userText = incomingMsg.body || "";
  const incomingWasAudio = incomingMsg.kind === "audio";

  // Transcreve o áudio recebido (se houver) pra IA saber o que o cliente falou
  if (incomingWasAudio && incomingAudio) {
    const transcript = await transcribeAudio(incomingAudio.base64, incomingAudio.mimetype, apiKey);
    if (!transcript) return; // não deu pra entender o áudio — não responde às cegas
    userText = transcript;
    // guarda a transcrição no histórico (aparece como legenda do áudio no chat)
    await prisma.message.update({ where: { id: incomingMsg.id }, data: { body: transcript } });
  }

  // Documento/imagem recebido: analisa com modelo de visão pra IA saber se o
  // arquivo parece o documento certo e legível, antes de decidir a resposta.
  const isImageDoc =
    incomingMsg.kind === "image" ||
    (incomingMsg.kind === "document" && (incomingMsg.mimeType || "").startsWith("image/"));
  let docAnalysis = null;
  if (isImageDoc && incomingMsg.mediaUrl) {
    const base64 = incomingMsg.mediaUrl.split(",")[1];
    docAnalysis = await analyzeDocumentImage(base64, incomingMsg.mimeType, incomingMsg.body, apiKey).catch(() => null);
  }

  if (!userText.trim() && !docAnalysis) return;

  // Mostra "digitando…" pro cliente enquanto a IA processa — modelos maiores (70B)
  // podem levar dezenas de segundos, isso evita parecer que travou.
  sendPresence(contact.phone, instance).catch(() => {});

  const recentMessages = await prisma.message.findMany({
    where: { contactId: contact.id, id: { not: incomingMsg.id } },
    orderBy: { createdAt: "desc" },
    take: 12,
  });
  const history = recentMessages
    .reverse()
    .map((m) => ({ role: m.fromMe ? "assistant" : "user", content: m.body || "" }))
    .filter((m) => m.content.trim());

  // Dá pra IA o telefone/DDD do lead atual — sem isso ela não tem como saber
  // qual contato regional (ex.: "Cobrador SP") enviar, só adivinhando pelo texto.
  const digits = onlyDigits(contact.phone || "");
  const ddd = digits.startsWith("55") ? digits.slice(2, 4) : digits.slice(0, 2);
  if (ddd) {
    history.unshift({
      role: "system",
      content: `Dados do lead atual nesta conversa: telefone ${contact.phone}, DDD ${ddd}.`,
    });
  }

  history.push({ role: "user", content: userText || "[Enviou uma imagem/documento]" });
  if (docAnalysis) {
    history.push({
      role: "system",
      content:
        `Análise automática do arquivo que o cliente acabou de enviar: ${docAnalysis}\n` +
        `Se a análise indicar que o documento está errado, ilegível ou incompleto, avise o cliente e peça pra reenviar corretamente. Se estiver ok, siga o fluxo normalmente.`,
    });
  }

  // Loop de function calling: a IA pode chamar uma função, ver o resultado e
  // decidir chamar outra (ex.: enviar o contato do cobrador E mudar a etapa)
  // antes de dar a resposta final em texto. Limite de rodadas evita loop infinito.
  let reply = null;
  let anyToolRan = false;
  const messages = history;
  for (let round = 0; round < 5; round++) {
    const result_ia = await askIa(messages, agent, apiKey);
    if (!result_ia) return;

    if (!result_ia.toolCalls?.length) {
      reply = result_ia.content;
      break;
    }
    anyToolRan = true;

    const toolResults = await executeToolCalls(result_ia.toolCalls, contact, agent, instance).catch((err) => {
      console.error("[IA function calling] erro ao executar:", err.message);
      return [];
    });

    // Alimenta a próxima rodada com o que foi chamado + o resultado, no formato OpenAI
    messages.push({
      role: "assistant",
      content: result_ia.content || null,
      tool_calls: result_ia.toolCalls,
    });
    for (const call of result_ia.toolCalls) {
      const res = toolResults.find((r) => r.id === call.id) || { ok: false };
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(res) });
    }

    if (result_ia.content) {
      reply = result_ia.content;
      break;
    }
    // sem conteúdo ainda — deixa rodar mais uma vez pra ver se a IA quer chamar outra função
  }

  // O loop esgotou as rodadas chamando função atrás de função sem nunca dar uma
  // resposta em texto — força mais uma chamada SEM ferramentas, só pra garantir
  // que o cliente recebe alguma confirmação (nunca fica em silêncio total).
  if (!reply && anyToolRan) {
    messages.push({ role: "user", content: "(Confirme rapidamente o que foi feito, em uma mensagem curta.)" });
    const finalTry = await askIa(messages, agent, apiKey, { noTools: true });
    reply = finalTry?.content || null;
  }

  if (!reply) return; // não chamou função nenhuma e não sobrou texto pra responder — encerra aqui

  // Rede de segurança: a IA às vezes CONFIRMA em texto que os documentos estão
  // corretos/aprovados mesmo sem ter recebido nenhum arquivo real na conversa
  // (o cliente só disse "enviado" por texto). Troca a resposta por um aviso
  // pedindo o anexo de verdade, em vez de deixar a confirmação falsa passar.
  const pareceConfirmarDocumentos = /aprovad|confirm\w*\s+(a\s+)?documenta[cç][ãa]o|documenta[cç][ãa]o\s+(est[áa]\s+)?(completa|correta|em ordem|certa|confirmada)/i.test(reply);
  if (pareceConfirmarDocumentos && !(await hasReceivedRealDocuments(contact.id))) {
    reply = "Ainda não recebi nenhum documento de verdade nesta conversa — preciso que você anexe os documentos como foto ou arquivo (não só escrever que enviou) pra eu poder confirmar e continuar.";
  }

  // Rede de segurança extra: se a resposta MENCIONA o cobrador (ex.: a mensagem
  // fixa de handoff) mas a função de enviar contato nunca rodou de verdade
  // nessa conversa, manda o contato agora — a IA às vezes só narra essa frase
  // sem chamar a função, mesmo depois de perguntada diretamente sobre o contato.
  if (/cobrador/i.test(reply)) {
    const hasContact = await prisma.message.findFirst({ where: { contactId: contact.id, kind: "contact" } });
    if (!hasContact && (await hasReceivedRealDocuments(contact.id)) && (await hasReceivedVideoAndLocation(contact.id))) {
      await autoSendCobradorContact(contact, instance).catch(() => {});
    }
  }

  const modo = agent.modoResposta || "espelho";
  const responderPorAudio = modo === "audio" || (modo === "espelho" && incomingWasAudio);

  if (responderPorAudio) {
    const audio = await synthesizeSpeech(reply, agent, cfg);
    if (audio) {
      const result = await sendWhatsappAudio(contact.phone, audio.base64, instance);
      await prisma.message.create({
        data: {
          contactId: contact.id,
          body: reply,
          kind: "audio",
          mediaUrl: `data:${audio.mimetype};base64,${audio.base64}`,
          mimeType: audio.mimetype,
          fromMe: true,
          status: result.simulated ? "simulado" : "enviado",
          instance,
        },
      });
      // Listas/checklists (documentos, passos numerados etc.) são difíceis de
      // acompanhar só de ouvido — manda o texto também, mesmo no modo áudio.
      if (isListLike(reply)) {
        const textResult = await sendWhatsappText(contact.phone, reply, instance);
        await prisma.message.create({
          data: {
            contactId: contact.id,
            body: reply,
            fromMe: true,
            status: textResult.simulated ? "simulado" : "enviado",
            kind: "text",
            instance,
          },
        });
      }
      return;
    }
    // síntese falhou — segue pro fallback de texto abaixo
  }

  const result = await sendWhatsappText(contact.phone, reply, instance);
  await prisma.message.create({
    data: {
      contactId: contact.id,
      body: reply,
      fromMe: true,
      status: result.simulated ? "simulado" : "enviado",
      kind: "text",
      instance,
    },
  });
}
