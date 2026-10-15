import { prisma } from "@/lib/prisma";

// Tudo o que a IA envia sai SOMENTE pelo número de vendas (Configurações → IA → mensagem inicial → instância).
// O número de cobrança nunca é usado pela IA, mesmo quando o cliente escreveu para ele.
export async function instanciaDaIa(fallback) {
  const cfg = await prisma.config.findUnique({ where: { id: "singleton" }, select: { mensagemInicialInstancia: true } }).catch(() => null);
  return cfg?.mensagemInicialInstancia || fallback;
}

// O número de vendas está conectado? Enquanto ele estiver fora do ar, as rotinas automáticas (follow-up, perda por inatividade,
// varredura) NÃO andam: o cliente não recebe nada e não consegue responder, então "sumiu" seria culpa nossa, não dele.
// Estado desconhecido (nunca verificado) conta como conectado, para não travar instalações sem esse registro.
export async function vendasConectado() {
  const cfg = await prisma.config.findUnique({ where: { id: "singleton" }, select: { mensagemInicialInstancia: true } }).catch(() => null);
  if (!cfg?.mensagemInicialInstancia) return true;
  const num = await prisma.whatsappNumber.findFirst({ where: { instance: cfg.mensagemInicialInstancia }, select: { ultimoEstado: true } }).catch(() => null);
  if (!num?.ultimoEstado) return true;
  return num.ultimoEstado === "open";
}
