import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { negarSeNaoPodeVerContato } from "@/lib/contatoAcesso";

export const runtime = "nodejs";

// Resumo da conversa por IA — o cobrador precisa saber o que já foi combinado
// sem ler 200 mensagens. Não persiste: é sempre gerado do histórico atual.
export async function POST(_req, { params }) {
  const { id } = await params;
  const negado = await negarSeNaoPodeVerContato(id);
  if (negado) return negado;
  const cfg = await prisma.config.findUnique({ where: { id: "singleton" } });
  if (!cfg?.deepinfraApiKey) {
    return NextResponse.json({ error: "Configure a chave da DeepInfra em Configurações > IA." }, { status: 400 });
  }

  const contact = await prisma.contact.findUnique({
    where: { id },
    select: { name: true },
  });
  if (!contact) return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });

  // Busca as últimas 60 e reordena pra ordem cronológica — a IA precisa ler na
  // sequência em que a conversa aconteceu.
  const mensagens = await prisma.message.findMany({
    where: { contactId: id },
    orderBy: { createdAt: "desc" },
    take: 60,
    select: { body: true, fromMe: true, kind: true, createdAt: true },
  });
  if (!mensagens.length) return NextResponse.json({ resumo: "Nenhuma mensagem nessa conversa ainda." });

  const historico = mensagens
    .reverse()
    .map((m) => {
      const quem = m.fromMe ? "Atendente" : contact.name || "Cliente";
      const texto = m.body || `[${m.kind}]`;
      return `${quem}: ${texto}`;
    })
    .join("\n");

  const prompt =
    "Você lê conversas de cobrança de um sistema de microcrédito. Resuma a conversa abaixo " +
    "em NO MÁXIMO 5 linhas, em português, cobrindo: o que o cliente pediu ou alegou, o que foi " +
    "combinado (valores, prazos, promessas de pagamento) e qual o próximo passo. Seja direto, " +
    "sem saudação e sem repetir a conversa.\n\n" +
    historico;

  try {
    const res = await fetch("https://api.deepinfra.com/v1/openai/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.deepinfraApiKey}` },
      body: JSON.stringify({
        model: "meta-llama/Meta-Llama-3.1-8B-Instruct",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 300,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({ error: data?.error?.message || `IA respondeu ${res.status}` }, { status: 502 });
    }
    const resumo = data?.choices?.[0]?.message?.content?.trim();
    if (!resumo) return NextResponse.json({ error: "A IA não devolveu um resumo." }, { status: 502 });
    return NextResponse.json({ resumo, mensagensLidas: mensagens.length });
  } catch (err) {
    // Não devolve err.message pro cliente — pode vazar detalhe interno da
    // chamada à DeepInfra (URL, corpo da requisição) num erro inesperado.
    console.error("[resumoConversa] erro:", err.message);
    return NextResponse.json({ error: "Erro ao gerar o resumo." }, { status: 500 });
  }
}
