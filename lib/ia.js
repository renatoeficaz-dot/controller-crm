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

// Chama a DeepInfra (API compatível com OpenAI) para gerar a resposta do
// agente. Retorna o texto da resposta ou null se não configurado/der erro.
export async function askIa(history, agent, apiKey) {
  if (!agent || !apiKey) return null;

  const model = agent.textModel || "meta-llama/Meta-Llama-3.1-8B-Instruct";
  const messages = [];
  if (agent.prompt) messages.push({ role: "system", content: agent.prompt });
  messages.push(...history);

  try {
    const res = await fetch("https://api.deepinfra.com/v1/openai/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, temperature: 0.6, max_tokens: 400 }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return null;
    return data?.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
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
