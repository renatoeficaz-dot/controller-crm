import { prisma } from "@/lib/prisma";

// Dono das tarefas automáticas (dúvida do cliente, erro/verificação da IA, análise, vídeo chamada, puxada...). O gestor fica só com
// "Liberar pagamento" e "Conferir pagamento" (essas continuam pelo responsável da etapa / do lead). Pedido do Renato.
const NOME_PADRAO = "Arthur trabalho";
let cache = { nome: null, ate: 0 };

export async function responsavelTarefasAuto(fallback = null) {
  if (Date.now() < cache.ate && cache.nome) return cache.nome;
  const u = await prisma.user.findFirst({ where: { name: NOME_PADRAO }, select: { name: true } }).catch(() => null);
  cache = { nome: u?.name || null, ate: Date.now() + 60_000 };
  return cache.nome || fallback;
}
