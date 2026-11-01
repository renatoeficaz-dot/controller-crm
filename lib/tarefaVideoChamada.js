import { prisma } from "@/lib/prisma";

// Quando o lead chega em "Vídeo chamada", alguém precisa agendar/fazer a
// verificação com o cliente — essa tarefa é o lembrete disso. Mesmo padrão
// de tarefaLiberarPagamento.js.
export async function criarTarefaVideoChamada(contactId) {
  const [stage, tipo] = await Promise.all([
    prisma.stage.findFirst({ where: { name: "Vídeo chamada" } }),
    prisma.taskType.findFirst({ where: { name: "Vídeo Chamada" } }),
  ]);
  await prisma.task.create({
    data: {
      contactId,
      title: "Vídeo chamada com o cliente",
      dueDate: new Date(),
      responsavel: stage?.autoResponsavel || null,
      tipoId: tipo?.id || null,
    },
  });
}

// Ao entrar em "Vídeo chamada", o número de Vendas manda sozinho a mensagem pronta "cobrador SP" (contato do cobrador + instruções
// pra agendar a vídeo chamada) pros leads de SP — o texto vem da mensagem pronta, então editar lá muda o que é enviado.
// Estado = o do cadastro; sem ele, o DDD do telefone (11 a 19 = SP). 1x por lead a cada 24h, nunca duplica.
export async function enviarCobradorVideoChamada(contactId) {
  const contact = await prisma.contact.findUnique({ where: { id: contactId }, select: { id: true, phone: true, estado: true, excluidoEm: true } });
  if (!contact?.phone || contact.excluidoEm) return false;
  const ddd = String(contact.phone).replace(/\D/g, "").replace(/^55/, "").slice(0, 2);
  const { ufFromPhone } = await import("@/lib/ddd");
  const uf = String(contact.estado || ufFromPhone(contact.phone) || "").toUpperCase();
  // Mensagem pronta do cobrador do estado ("cobrador SP", "Cobrador SC") ou do DDD ("Cobrador 85"); estado sem cobrador recebe "NA - Cobrador região".
  const todos = await prisma.messageTemplate.findMany({ where: { interno: false } });
  const norm = (t) => String(t.title).trim().toLowerCase();
  const tpl = todos.find((t) => norm(t) === "cobrador " + uf.toLowerCase())
    || todos.find((t) => norm(t) === "cobrador " + ddd)
    || todos.find((t) => norm(t) === "na - cobrador região");
  const body = String(tpl?.body || "").trim();
  if (!body) return false;
  const ja = await prisma.message.count({ where: { contactId, fromMe: true, body, createdAt: { gte: new Date(Date.now() - 24 * 3600e3) } } });
  if (ja) return false;
  const { sendWhatsappText } = await import("@/lib/evolution");
  const { instanciaDaIa } = await import("@/lib/instanciaIa");
  const numeroVendas = await prisma.whatsappNumber.findFirst({ where: { agentId: { not: null } } });
  const instance = await instanciaDaIa(numeroVendas?.instance);
  if (!instance) return false;
  const result = await sendWhatsappText(contact.phone, body, instance);
  await prisma.message.create({
    data: { enviadoPor: "Automático", contactId, body, kind: "text", fromMe: true, status: result.simulated ? "simulado" : result.ok ? "enviado" : "erro", instance },
  });
  // Se o lead não chamar o cobrador em 30 min, a IA cobra do número de Vendas ("Chamou?"); cancelado se ele sair de "Vídeo chamada".
  if (result.ok) {
    const numero = (await prisma.whatsappNumber.findFirst({ where: { instance } })) || numeroVendas;
    if (numero) {
      await prisma.mensagemAgendada.create({
        data: { contactId, numeroId: numero.id, corpo: MSG_CHAMOU, dataHora: new Date(Date.now() + 30 * 60e3) },
      }).catch(() => {});
    }
  }
  return !!result.ok;
}

export const MSG_CHAMOU = "Chamou?";
