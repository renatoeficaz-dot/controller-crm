import { prisma } from "@/lib/prisma";

export async function getIaConfig() {
  return prisma.config.findUnique({ where: { id: "singleton" } }).catch(() => null);
}

// Chama a DeepInfra (API compatível com OpenAI) para gerar a resposta do
// atendimento automático por IA. Retorna o texto da resposta ou null se
// não estiver configurado/ativo ou der erro.
export async function askIa(history, cfg) {
  cfg = cfg || (await getIaConfig());
  if (!cfg?.iaAtivo || !cfg.deepinfraApiKey) return null;

  const model = cfg.deepinfraTextModel || "meta-llama/Meta-Llama-3.1-8B-Instruct";
  const messages = [];
  if (cfg.iaPrompt) messages.push({ role: "system", content: cfg.iaPrompt });
  messages.push(...history);

  try {
    const res = await fetch("https://api.deepinfra.com/v1/openai/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.deepinfraApiKey}`,
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

// Converte texto em áudio (TTS) usando o modelo configurado na DeepInfra (ex.: Kokoro-82M).
// Retorna { base64, mimetype } (sem o prefixo "data:...;base64,") ou null se falhar.
export async function synthesizeSpeech(text, cfg) {
  cfg = cfg || (await getIaConfig());
  if (!cfg?.deepinfraApiKey || !text?.trim()) return null;
  const model = cfg.deepinfraTtsModel || "hexgrad/Kokoro-82M";

  try {
    const res = await fetch(`https://api.deepinfra.com/v1/inference/${model}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.deepinfraApiKey}`,
      },
      body: JSON.stringify({ text }),
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
export async function transcribeAudio(base64, mimetype, cfg) {
  cfg = cfg || (await getIaConfig());
  if (!cfg?.deepinfraApiKey || !base64) return null;

  try {
    const bytes = Buffer.from(base64, "base64");
    const blob = new Blob([bytes], { type: mimetype || "audio/ogg" });
    const form = new FormData();
    form.append("audio", blob, "audio.ogg");

    const res = await fetch("https://api.deepinfra.com/v1/inference/openai/whisper-large-v3-turbo", {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.deepinfraApiKey}` },
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return null;
    return data?.text?.trim() || null;
  } catch {
    return null;
  }
}
