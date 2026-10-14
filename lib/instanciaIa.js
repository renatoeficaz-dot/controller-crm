import { prisma } from "@/lib/prisma";

// Tudo o que a IA envia sai SOMENTE pelo número de vendas (Configurações → IA → mensagem inicial → instância).
// O número de cobrança nunca é usado pela IA, mesmo quando o cliente escreveu para ele.
export async function instanciaDaIa(fallback) {
  const cfg = await prisma.config.findUnique({ where: { id: "singleton" }, select: { mensagemInicialInstancia: true } }).catch(() => null);
  return cfg?.mensagemInicialInstancia || fallback;
}
