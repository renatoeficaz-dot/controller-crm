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

// Converte texto em áudio (TTS) usando o modelo do agente na DeepInfra (ex.: Kokoro-82M).
// Retorna { base64, mimetype } (sem o prefixo "data:...;base64,") ou null se falhar.
export async function synthesizeSpeech(text, agent, apiKey) {
  if (!apiKey || !text?.trim()) return null;
  const model = agent?.ttsModel || "hexgrad/Kokoro-82M";

  try {
    const body = { text };
    if (agent?.ttsVoice) body.voice = agent.ttsVoice;
    const res = await fetch(`https://api.deepinfra.com/v1/inference/${model}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.audio) return null;
    // audio vem como "data:audio/wav;base64,XXXX"
    const match = /^data:([^;]+);base64,(.+)$/s.exec(data.audio);
    if (!match) return null;
    return { mimetype: match[1], base64: match[2] };
  } catch {
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
