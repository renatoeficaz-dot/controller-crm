import { prisma } from "@/lib/prisma";
import { sendWhatsappText } from "@/lib/evolution";

function loadFlow(flow) {
  return {
    nodes: JSON.parse(flow.nodesJson || "[]"),
    edges: JSON.parse(flow.edgesJson || "[]"),
  };
}

function findNode(nodes, id) {
  return nodes.find((n) => n.id === id);
}

async function sendNodeMessage(contact, node, instance) {
  const text = node?.data?.message || "";
  if (!text.trim()) return;
  const result = await sendWhatsappText(contact.phone, text, instance);
  await prisma.message.create({
    data: {
      contactId: contact.id,
      body: text,
      fromMe: true,
      status: result.simulated ? "simulado" : "enviado",
      kind: "text",
      instance,
    },
  });
}

// Avança ou inicia o fluxo de chatbot para um contato que acabou de mandar uma mensagem
// (chamado pelo webhook depois de salvar a mensagem recebida).
// isNewContact: true se o contato acabou de ser criado por esta mesma mensagem.
// Retorna true se o fluxo tratou a mensagem (enviou algo ou encerrou uma sessão em
// andamento) — usado pelo webhook pra saber se ainda deve chamar a IA livre ou não.
export async function handleChatbotMessage(contact, text, isNewContact, instance) {
  const activeFlow = await prisma.chatbotFlow.findFirst({ where: { active: true } });
  if (!activeFlow) return false;
  const { nodes, edges } = loadFlow(activeFlow);
  if (!nodes.length) return false;

  // Sessão em andamento neste fluxo: tenta avançar a partir do nó atual
  if (contact.botFlowId === activeFlow.id && contact.botNodeId) {
    const outgoing = edges.filter((e) => e.source === contact.botNodeId);
    const lower = (text || "").toLowerCase();
    let edge = outgoing.find((e) => e.label && lower.includes(String(e.label).toLowerCase()));
    if (!edge) edge = outgoing.find((e) => !e.label); // aresta padrão (sem palavra-chave)
    if (!edge) {
      // sem aresta correspondente à resposta — encerra a sessão do bot
      await prisma.contact.update({ where: { id: contact.id }, data: { botFlowId: null, botNodeId: null } });
      return true;
    }
    const target = findNode(nodes, edge.target);
    if (!target) return true;
    await sendNodeMessage(contact, target, instance);
    const hasMore = edges.some((e) => e.source === target.id);
    await prisma.contact.update({
      where: { id: contact.id },
      data: { botFlowId: hasMore ? activeFlow.id : null, botNodeId: hasMore ? target.id : null },
    });
    return true;
  }

  // Sem sessão ativa: decide se inicia o fluxo agora.
  // Com palavra-chave configurada: dispara sempre que a mensagem contiver o termo.
  // Sem palavra-chave: dispara só na 1ª mensagem de um lead novo (saudação automática).
  const keyword = (activeFlow.triggerKeyword || "").trim().toLowerCase();
  const matches = keyword ? (text || "").toLowerCase().includes(keyword) : isNewContact;
  if (!matches) return false;

  const start = nodes.find((n) => n.data?.isStart) || nodes[0];
  if (!start) return false;
  await sendNodeMessage(contact, start, instance);
  const hasMore = edges.some((e) => e.source === start.id);
  await prisma.contact.update({
    where: { id: contact.id },
    data: { botFlowId: hasMore ? activeFlow.id : null, botNodeId: hasMore ? start.id : null },
  });
  return true;
}
