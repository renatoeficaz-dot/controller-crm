import { prisma } from "@/lib/prisma";

export async function getIaConfig() {
  return prisma.config.findUnique({ where: { id: "singleton" } }).catch(() => null);
}

// Agente de IA vinculado a uma instância (número) da Evolution, ou null se
// nenhum agente estiver atribuído a esse número (IA desligada por lá).
export async function getAgentForInstance(instance) {
  if (!instance) return null;
  const num = await prisma.whatsappNumber.findFirst({ where: { instance }, include: { agent: true } });
  return num?.agent || null;
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
export async function askIa(history, agent, apiKey) {
  if (!agent || !apiKey) return null;

  const model = agent.textModel || "meta-llama/Meta-Llama-3.1-8B-Instruct";
  const messages = [];
  if (agent.prompt) messages.push({ role: "system", content: agent.prompt });
  messages.push(...history);
  const tools = buildTools(agent);

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
export async function executeToolCalls(toolCalls, contact, agent, instance) {
  const { sendWhatsappContact } = await import("@/lib/evolution");
  const results = [];

  for (const call of toolCalls || []) {
    const name = call?.function?.name;
    let args = {};
    try { args = JSON.parse(call.function.arguments || "{}"); } catch { /* args inválidos, segue vazio */ }

    try {
      if (name === "send_contact" && agent.toolSendContact) {
        if (!agent.toolContactName || !agent.toolContactPhone) {
          results.push({ name, error: "Contato não configurado no agente" });
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
        results.push({ name, ok: true });
      } else if (name === "send_template" && agent.toolSendTemplate) {
        const ok = await sendTemplateByTitle(args.title, contact, instance);
        results.push({ name, ok, title: args.title });
      } else if (name === "move_stage" && agent.toolMoveStage) {
        const ok = await moveContactStage(contact.id, args.stage_name);
        results.push({ name, ok, stage: args.stage_name });
      } else {
        results.push({ name, error: "Função não habilitada" });
      }
    } catch (err) {
      results.push({ name, error: err.message });
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

async function moveContactStage(contactId, stageName) {
  if (!stageName) return false;
  const stage = await prisma.stage.findFirst({ where: { name: { equals: stageName } } });
  if (!stage) return false;
  const last = await prisma.contact.findFirst({ where: { stageId: stage.id }, orderBy: { order: "desc" } });
  await prisma.contact.update({
    where: { id: contactId },
    data: { stageId: stage.id, order: (last?.order ?? -1) + 1 },
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
