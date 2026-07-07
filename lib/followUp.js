import { prisma } from "@/lib/prisma";
import { getAgentForInstance, agentShouldStayQuiet } from "@/lib/ia";

const TRINTA_MIN = 30 * 60 * 1000;

// Roda a cada poucos minutos (ver instrumentation.js). Se a última mensagem
// de uma conversa foi da IA (o cliente ficou 30min ou mais sem responder),
// manda um "?" simples pra tentar reengajar. Não repete: depois de mandado,
// o próprio "?" vira a última mensagem e a condição não bate mais até o
// cliente responder e a IA mandar outra coisa.
export async function checarFollowUp30min() {
  const numeros = await prisma.whatsappNumber.findMany({
    where: { agentId: { not: null } },
  });
  if (!numeros.length) return;

  const { sendWhatsappText } = await import("@/lib/evolution");
  const limite = new Date(Date.now() - TRINTA_MIN);

  for (const numero of numeros) {
    const agent = await getAgentForInstance(numero.instance);
    if (!agent) continue;

    const candidatos = await prisma.contact.findMany({
      where: {
        messages: { some: { instance: numero.instance, fromMe: true, createdAt: { lte: limite } } },
      },
      include: { stage: true },
    });

    for (const contact of candidatos) {
      if (agentShouldStayQuiet(agent, contact.stage)) continue;

      const last = await prisma.message.findFirst({
        where: { contactId: contact.id },
        orderBy: { createdAt: "desc" },
      });
      if (!last || !last.fromMe || last.instance !== numero.instance) continue;
      if (last.body === "?") continue;
      if (last.createdAt > limite) continue;

      const result = await sendWhatsappText(contact.phone, "?", numero.instance);
      await prisma.message.create({
        data: {
          contactId: contact.id,
          body: "?",
          kind: "text",
          fromMe: true,
          status: result.simulated ? "simulado" : result.ok ? "enviado" : "erro",
          instance: numero.instance,
        },
      });
    }
  }
}
