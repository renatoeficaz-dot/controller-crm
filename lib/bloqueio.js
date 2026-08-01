import { prisma } from "@/lib/prisma";

const N_SEGUIDAS = 3;

// Item 173: o WhatsApp não avisa quando um cliente bloqueia o número — o único
// sinal que temos é o envio começar a falhar. 3 falhas seguidas (sem nenhum
// sucesso nem resposta do cliente no meio) é o padrão de "parou de entregar",
// bem diferente de uma falha isolada de rede.
export async function pareceBloqueado(contactId) {
  const ultimas = await prisma.message.findMany({
    where: { contactId, fromMe: true },
    orderBy: { createdAt: "desc" },
    take: N_SEGUIDAS,
    select: { status: true },
  });
  if (ultimas.length < N_SEGUIDAS) return false;
  return ultimas.every((m) => m.status === "falhou" || m.status === "erro");
}

// Versão em lote pra telas de lista (evita 1 query por contato).
export async function contatosComPossivelBloqueio(contactIds) {
  if (!contactIds.length) return new Set();
  const msgs = await prisma.message.findMany({
    where: { contactId: { in: contactIds }, fromMe: true },
    orderBy: { createdAt: "desc" },
    select: { contactId: true, status: true },
  });
  const porContato = new Map();
  for (const m of msgs) {
    if (!porContato.has(m.contactId)) porContato.set(m.contactId, []);
    const lista = porContato.get(m.contactId);
    if (lista.length < N_SEGUIDAS) lista.push(m.status);
  }
  const bloqueados = new Set();
  for (const [id, lista] of porContato) {
    if (lista.length >= N_SEGUIDAS && lista.every((s) => s === "falhou" || s === "erro")) bloqueados.add(id);
  }
  return bloqueados;
}
