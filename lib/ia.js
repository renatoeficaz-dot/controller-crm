import { prisma } from "@/lib/prisma";

// minúsculo e sem acento, pra comparar nomes de etapa sem depender de acentuação exata
function normalizeStageName(name) {
  return (name || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
}

export async function getIaConfig() {
  return prisma.config.findUnique({ where: { id: "singleton" } }).catch(() => null);
}

// Analisa uma imagem/documento recebido do lead com um modelo de visão,
// pra dar pra IA de texto um contexto sobre se o arquivo parece correto
// (tipo certo, legível) antes dela decidir a resposta. Não é prova contra
// fraude — só pega erros grosseiros (documento errado, ilegível, cortado).
export async function analyzeDocumentImage(base64, mimetype, caption, apiKey) {
  if (!apiKey || !base64) return null;
  const prompt =
    `Você é um verificador de documentos para um empréstimo pessoal. Analise esta imagem e responda em português, em no máximo 3 linhas:\n` +
    `1. Que tipo de documento parece ser (CNH, comprovante de residência, selfie com documento, print de rede social, documento do veículo, contrato de locação, foto do carro com placa, etc.) ou diga que não reconhece.\n` +
    `2. Se está legível (não borrado, não cortado, informação visível).\n` +
    `3. Só aponte suspeita de edição/adulteração se for muito óbvio — não invente sem motivo.` +
    (caption ? `\nLegenda enviada pelo cliente: "${caption}"` : "");

  try {
    const res = await fetch("https://api.deepinfra.com/v1/openai/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:${mimetype};base64,${base64}` } },
            ],
          },
        ],
        max_tokens: 200,
      }),
    });
    const data = await res.json().catch(() => null);
    return data?.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

// Agente de IA vinculado a uma instância (número) da Evolution, ou null se
// nenhum agente estiver atribuído a esse número (IA desligada por lá).
export async function getAgentForInstance(instance) {
  if (!instance) return null;
  const num = await prisma.whatsappNumber.findFirst({
    where: { instance },
    include: { agent: { include: { stopAtStage: true } } },
  });
  return num?.agent || null;
}

// true se o agente deve ficar em silêncio nesta etapa (ela ou qualquer uma
// depois dela na ordem do funil) — atendimento passou a ser humano.
export function agentShouldStayQuiet(agent, contactStage) {
  if (!agent?.stopAtStage || !contactStage) return false;
  return contactStage.order >= agent.stopAtStage.order;
}

// Monta a lista de "tools" (function calling) que esse agente pode usar,
// conforme as funções habilitadas nele. undefined = nenhuma função ligada.
function buildTools(agent) {
  const tools = [];
  if (agent.toolSendContact) {
    tools.push({
      type: "function",
      function: {
        name: "send_contact",
        description: "Envia o cartão de contato (vCard) configurado para este agente. Use quando o cliente pedir um contato, indicação ou número de outra pessoa/setor.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    });
  }
  if (agent.toolSendTemplate) {
    tools.push({
      type: "function",
      function: {
        name: "send_template",
        description: "Envia uma mensagem pronta cadastrada no sistema (pode ser texto, imagem, áudio pré-gravado ou documento) pelo título exato dela.",
        parameters: {
          type: "object",
          properties: { title: { type: "string", description: "Título exato da mensagem pronta a enviar" } },
          required: ["title"],
        },
      },
    });
  }
  if (agent.toolMoveStage) {
    tools.push({
      type: "function",
      function: {
        name: "move_stage",
        description: "Move o lead/cliente atual para outra etapa do funil (Kanban) pelo nome exato da etapa.",
        parameters: {
          type: "object",
          properties: { stage_name: { type: "string", description: "Nome exato da etapa de destino" } },
          required: ["stage_name"],
        },
      },
    });
  }
  return tools.length ? tools : undefined;
}

// Chama a DeepInfra (API compatível com OpenAI) para gerar a resposta do agente.
// Retorna { content, toolCalls } — content pode ser null se o modelo só chamou
// função(ões); toolCalls é um array (pode ser vazio) no formato do OpenAI.
export async function askIa(history, agent, apiKey, opts = {}) {
  if (!agent || !apiKey) return null;

  const model = agent.textModel || "meta-llama/Meta-Llama-3.1-8B-Instruct";
  const messages = [];
  if (agent.prompt) messages.push({ role: "system", content: agent.prompt });
  messages.push(...history);
  const tools = opts.noTools ? undefined : buildTools(agent);

  try {
    const body = { model, messages, temperature: 0.6, max_tokens: 400 };
    if (tools) body.tools = tools;
    const res = await fetch("https://api.deepinfra.com/v1/openai/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("[IA texto] falhou:", res.status, JSON.stringify(data).slice(0, 300));
      return null;
    }
    const msg = data?.choices?.[0]?.message;
    if (!msg) return null;
    return { content: msg.content?.trim() || null, toolCalls: msg.tool_calls || [] };
  } catch (err) {
    console.error("[IA texto] erro:", err.message);
    return null;
  }
}

// Executa as funções que a IA decidiu chamar. Retorna um resumo do que foi
// feito (usado só pra log — as próprias funções já mandam mensagem ao cliente
// quando fizer sentido, como enviar contato/template).
// Rede de segurança: a IA às vezes aceita a palavra do cliente ("enviado")
// sem nunca ter recebido um arquivo de verdade. Exige um mínimo de
// imagens/documentos reais recebidos nesta conversa antes de liberar o
// contato do cobrador — não prova que são os documentos certos, mas barra
// o caso claro de "não anexou nada".
export async function hasReceivedRealDocuments(contactId, minCount = 3) {
  const count = await prisma.message.count({
    where: { contactId, fromMe: false, kind: { in: ["image", "document"] } },
  });
  return count >= minCount;
}

// Rede de segurança extra: a IA às vezes libera o cobrador logo depois dos
// documentos iniciais, sem esperar o vídeo de compromisso e a localização
// (que segundo o prompt vêm DEPOIS). Exige esses dois itens especificamente
// terem chegado nesta conversa antes de liberar.
export async function hasReceivedVideoAndLocation(contactId) {
  const video = await prisma.message.findFirst({
    where: { contactId, fromMe: false, kind: "document", mimeType: { startsWith: "video/" } },
  });
  const location = await prisma.message.findFirst({ where: { contactId, fromMe: false, kind: "location" } });
  return Boolean(video && location);
}

export async function executeToolCalls(toolCalls, contact, agent, instance) {
  const { sendWhatsappContact } = await import("@/lib/evolution");
  const results = [];

  for (const call of toolCalls || []) {
    const name = call?.function?.name;
    let args = {};
    try { args = JSON.parse(call.function.arguments || "{}"); } catch { /* args inválidos, segue vazio */ }

    try {
      if (name === "send_contact" && agent.toolSendContact) {
        // Evita duplicar: modelos às vezes chamam a mesma função 2x na mesma resposta.
        const already = await prisma.message.findFirst({ where: { contactId: contact.id, kind: "contact" } });
        if (already) {
          results.push({ id: call.id, name, ok: true, note: "já enviado antes, não repetiu" });
          continue;
        }
        if (!(await hasReceivedRealDocuments(contact.id))) {
          results.push({
            id: call.id, name, ok: false,
            error: "Não pode enviar o contato do cobrador ainda: o cliente não anexou nenhum documento de verdade nesta conversa (só texto). Peça pra reenviar os documentos como arquivo/foto de verdade antes de prosseguir.",
          });
          continue;
        }
        if (!(await hasReceivedVideoAndLocation(contact.id))) {
          results.push({
            id: call.id, name, ok: false,
            error: "Não pode enviar o contato do cobrador ainda: ainda falta o vídeo de compromisso e/ou a localização do cliente. Peça esses itens antes de prosseguir.",
          });
          continue;
        }
        if (!agent.toolContactName || !agent.toolContactPhone) {
          results.push({ id: call.id, name, error: "Contato não configurado no agente" });
          continue;
        }
        const result = await sendWhatsappContact(
          contact.phone,
          { name: agent.toolContactName, contactPhone: agent.toolContactPhone },
          instance
        );
        await prisma.message.create({
          data: {
            contactId: contact.id,
            body: `Contato: ${agent.toolContactName} (${agent.toolContactPhone})`,
            kind: "contact",
            fromMe: true,
            status: result.simulated ? "simulado" : "enviado",
            instance,
          },
        });
        results.push({ id: call.id, name, ok: true });
      } else if (name === "send_template" && agent.toolSendTemplate) {
        // Idem: se o template é do tipo contato e já mandamos um contato nessa
        // conversa, não repete (evita duplicar o cartão do cobrador).
        const tplPreview = await prisma.messageTemplate.findFirst({ where: { title: { equals: args.title } } });
        if (tplPreview?.mediaType === "contact") {
          const already = await prisma.message.findFirst({ where: { contactId: contact.id, kind: "contact" } });
          if (already) {
            results.push({ id: call.id, name, ok: true, title: args.title, note: "já enviado antes, não repetiu" });
            continue;
          }
          if (!(await hasReceivedRealDocuments(contact.id))) {
            results.push({
              id: call.id, name, ok: false, title: args.title,
              error: "Não pode enviar o contato do cobrador ainda: o cliente não anexou nenhum documento de verdade nesta conversa (só texto). Peça pra reenviar os documentos como arquivo/foto de verdade antes de prosseguir.",
            });
            continue;
          }
          if (!(await hasReceivedVideoAndLocation(contact.id))) {
            results.push({
              id: call.id, name, ok: false, title: args.title,
              error: "Não pode enviar o contato do cobrador ainda: ainda falta o vídeo de compromisso e/ou a localização do cliente. Peça esses itens antes de prosseguir.",
            });
            continue;
          }
        }
        const ok = await sendTemplateByTitle(args.title, contact, instance);
        results.push({ id: call.id, name, ok, title: args.title });
      } else if (name === "move_stage" && agent.toolMoveStage) {
        // Trava de segurança: não deixa mover pra "Liberação pagamento" sem antes
        // ter enviado de verdade o contato do cobrador (a IA às vezes só narra
        // essa ação em texto sem chamar a função — isso evita o lead ficar
        // travado sem contato, já que depois dessa etapa a IA fica em silêncio).
        if (normalizeStageName(args.stage_name).includes("liberacao")) {
          if (!(await hasReceivedRealDocuments(contact.id))) {
            results.push({
              id: call.id, name, ok: false,
              error: "Não pode mudar para essa etapa ainda: o cliente não anexou nenhum documento de verdade nesta conversa (só texto). Peça pra reenviar os documentos como arquivo/foto de verdade antes de prosseguir.",
            });
            continue;
          }
          if (!(await hasReceivedVideoAndLocation(contact.id))) {
            results.push({
              id: call.id, name, ok: false,
              error: "Não pode mudar para essa etapa ainda: ainda falta o vídeo de compromisso e/ou a localização do cliente. Peça esses itens antes de prosseguir.",
            });
            continue;
          }
          const hasContact = await prisma.message.findFirst({ where: { contactId: contact.id, kind: "contact" } });
          if (!hasContact) {
            // A IA às vezes esquece de chamar send_template mesmo depois do aviso —
            // como rede de segurança, o próprio sistema tenta mandar automaticamente
            // (só funciona bem se houver 1 único template de contato cadastrado;
            // com vários estados, melhor a IA escolher — mas aqui é o último recurso).
            const autoSent = await autoSendCobradorContact(contact, instance);
            if (!autoSent) {
              results.push({
                id: call.id, name, ok: false,
                error: "Não pode mudar para essa etapa ainda: envie o contato do cobrador (send_template) antes.",
              });
              continue;
            }
          }
        }
        const ok = await moveContactStage(contact.id, args.stage_name, instance);
        results.push({ id: call.id, name, ok, stage: args.stage_name });
      } else {
        results.push({ id: call.id, name, error: "Função não habilitada" });
      }
    } catch (err) {
      results.push({ id: call.id, name, error: err.message });
    }
  }
  return results;
}

async function sendTemplateByTitle(title, contact, instance) {
  if (!title) return false;
  const tpl = await prisma.messageTemplate.findFirst({ where: { title: { equals: title } } });
  if (!tpl) return false;

  const { sendWhatsappText, sendWhatsappMedia, sendWhatsappAudio, sendWhatsappContact } = await import("@/lib/evolution");
  let result;
  let kind = "text";
  if (tpl.mediaType === "contact") {
    result = await sendWhatsappContact(contact.phone, { name: tpl.contactName, contactPhone: tpl.contactPhone }, instance);
    kind = "contact";
  } else if (tpl.mediaType === "audio") {
    result = await sendWhatsappAudio(contact.phone, tpl.mediaBase64, instance);
    kind = "audio";
  } else if (tpl.mediaType === "image" || tpl.mediaType === "document") {
    result = await sendWhatsappMedia(contact.phone, {
      base64: tpl.mediaBase64, mimetype: tpl.mediaMimetype, fileName: tpl.mediaFileName,
      caption: tpl.body, mediatype: tpl.mediaType,
    }, instance);
    kind = tpl.mediaType;
  } else {
    result = await sendWhatsappText(contact.phone, tpl.body, instance);
  }
  if (!result.ok) return false;

  await prisma.message.create({
    data: {
      contactId: contact.id,
      body: tpl.mediaType === "contact" ? `Contato: ${tpl.contactName} (${tpl.contactPhone})` : tpl.body,
      kind,
      mediaUrl: tpl.mediaBase64 ? `data:${tpl.mediaMimetype};base64,${tpl.mediaBase64}` : null,
      mimeType: tpl.mediaMimetype || null,
      fileName: tpl.mediaFileName || null,
      fromMe: true,
      status: result.simulated ? "simulado" : "enviado",
      instance,
    },
  });
  return true;
}

// Rede de segurança: manda o contato do cobrador sozinho quando a IA esqueceu
// de chamar send_template. Só age com segurança quando há exatamente 1
// template do tipo "contato" cadastrado — com vários estados, quem escolhe
// certo é a IA (aqui não temos como saber a região sem repetir a lógica dela).
export async function autoSendCobradorContact(contact, instance) {
  const contatos = await prisma.messageTemplate.findMany({ where: { mediaType: "contact" } });
  if (contatos.length !== 1) return false;
  return sendTemplateByTitle(contatos[0].title, contact, instance);
}

async function moveContactStage(contactId, stageName, instance) {
  if (!stageName) return false;
  // Match normalizado (minúsculas, sem acento) — a IA às vezes manda o nome da
  // etapa com casing/acentuação diferente do cadastrado, e o `equals` exato
  // falhava em silêncio nesses casos (lead ficava travado na etapa errada).
  const stages = await prisma.stage.findMany();
  const target = normalizeStageName(stageName);
  const stage = stages.find((s) => normalizeStageName(s.name) === target);
  if (!stage) {
    console.error(`[IA move_stage] etapa não encontrada: "${stageName}"`);
    return false;
  }
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  const jaEstavaNaEtapa = contact?.stageId === stage.id;
  const last = await prisma.contact.findFirst({ where: { stageId: stage.id }, orderBy: { order: "desc" } });
  const data = { stageId: stage.id, order: (last?.order ?? -1) + 1 };
  // Ao entrar em "Análise", já preenche o valor do capital com o limite inicial
  // padrão (R$300) — evita ter que preencher manualmente depois.
  if (stage.name === "Análise") data.valorCapital = 300;
  await prisma.contact.update({ where: { id: contactId }, data });
  if (stage.name === "Recebimento" && !jaEstavaNaEtapa && contact) {
    await sendRecebimentoNotice(contact, instance).catch(() => {});
    const { lancarLiberacaoCapital } = await import("@/lib/cobranca");
    await lancarLiberacaoCapital({ ...contact, ...data }).catch(() => {});
  }
  return true;
}

// Mensagem fixa (não gerada pela IA, para garantir confiabilidade) enviada
// sempre que um lead entra na etapa "Recebimento", avisando que o cobrador
// da região assumiu a cobrança a partir do dia seguinte.
export async function sendRecebimentoNotice(contact, instanceHint) {
  const { sendWhatsappText, resolveInstanceForContact } = await import("@/lib/evolution");
  const text = "Olá o valor foi enviado, passamos o empréstimo para o cobrador da sua região, a partir de agora ele é o responsável do recebimento e começa a receber a partir de amanhã!";
  const instance = instanceHint || (await resolveInstanceForContact(contact.id));
  const result = await sendWhatsappText(contact.phone, text, instance);
  if (!result.ok) return false;
  await prisma.message.create({
    data: {
      contactId: contact.id,
      body: text,
      kind: "text",
      fromMe: true,
      status: result.simulated ? "simulado" : "enviado",
      instance,
    },
  });
  return true;
}

// Converte texto em áudio (TTS). O provedor é escolhido por agente
// (agent.ttsProvider: "deepinfra" | "fishaudio" | "elevenlabs").
// `cfg` é o Config completo (tem os 3 tokens possíveis).
// Retorna { base64, mimetype } ou null se não configurado/falhar.
export async function synthesizeSpeech(text, agent, cfg) {
  if (!agent || !text?.trim()) return null;
  const provider = agent.ttsProvider || "deepinfra";
  if (provider === "fishaudio") return synthesizeFishAudio(text, agent, cfg?.fishAudioApiKey);
  if (provider === "elevenlabs") return synthesizeElevenLabs(text, agent, cfg?.elevenLabsApiKey);
  return synthesizeDeepInfra(text, agent, cfg?.deepinfraApiKey);
}

async function synthesizeDeepInfra(text, agent, apiKey) {
  if (!apiKey) return null;
  const model = agent?.ttsModel || "ResembleAI/chatterbox-turbo";
  try {
    const body = { text };
    // A voz por nome (af_bella etc.) só existe no Kokoro — outros modelos ignoram/erram com isso.
    if (agent?.ttsVoice && model === "hexgrad/Kokoro-82M") body.voice = agent.ttsVoice;
    const res = await fetch(`https://api.deepinfra.com/v1/inference/${model}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.audio) {
      if (!res.ok) console.error("[TTS DeepInfra] falhou:", res.status, JSON.stringify(data).slice(0, 300));
      return null;
    }
    // audio vem como "data:audio/wav;base64,XXXX"
    const match = /^data:([^;]+);base64,(.+)$/s.exec(data.audio);
    if (!match) return null;
    return { mimetype: match[1], base64: match[2] };
  } catch (err) {
    console.error("[TTS DeepInfra] erro:", err.message);
    return null;
  }
}

// Fish Audio: https://api.fish.audio/v1/tts — devolve os bytes do áudio direto (não JSON).
async function synthesizeFishAudio(text, agent, apiKey) {
  if (!apiKey) return null;
  try {
    const body = { text, format: "wav" };
    if (agent?.ttsVoice) body.reference_id = agent.ttsVoice;
    const res = await fetch("https://api.fish.audio/v1/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error("[TTS Fish Audio] falhou:", res.status, errBody.slice(0, 300));
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) return null;
    return { mimetype: "audio/wav", base64: buf.toString("base64") };
  } catch (err) {
    console.error("[TTS Fish Audio] erro:", err.message);
    return null;
  }
}

// ElevenLabs: https://api.elevenlabs.io/v1/text-to-speech/{voice_id} — devolve os bytes do áudio direto.
async function synthesizeElevenLabs(text, agent, apiKey) {
  if (!apiKey || !agent?.ttsVoice) return null; // voice_id é obrigatório aqui
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${agent.ttsVoice}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "xi-api-key": apiKey },
      body: JSON.stringify({ text, model_id: "eleven_multilingual_v2" }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error("[TTS ElevenLabs] falhou:", res.status, errBody.slice(0, 300));
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) return null;
    return { mimetype: "audio/mpeg", base64: buf.toString("base64") };
  } catch (err) {
    console.error("[TTS ElevenLabs] erro:", err.message);
    return null;
  }
}

// Transcreve um áudio recebido (base64) usando Whisper na DeepInfra, pra IA
// conseguir "entender" o que o cliente falou. Retorna o texto ou null se falhar.
export async function transcribeAudio(base64, mimetype, apiKey) {
  if (!apiKey || !base64) return null;

  try {
    const bytes = Buffer.from(base64, "base64");
    const blob = new Blob([bytes], { type: mimetype || "audio/ogg" });
    const form = new FormData();
    form.append("audio", blob, "audio.ogg");

    const res = await fetch("https://api.deepinfra.com/v1/inference/openai/whisper-large-v3-turbo", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return null;
    return data?.text?.trim() || null;
  } catch {
    return null;
  }
}
