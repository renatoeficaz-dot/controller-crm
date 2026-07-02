import { prisma } from "@/lib/prisma";

// Chama a DeepInfra (API compatível com OpenAI) para gerar a resposta do
// atendimento automático por IA. Retorna o texto da resposta ou null se
// não estiver configurado/ativo ou der erro.
export async function askIa(history) {
  const cfg = await prisma.config.findUnique({ where: { id: "singleton" } }).catch(() => null);
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
