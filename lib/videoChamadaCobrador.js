import { prisma } from "@/lib/prisma";

// Fluxo separado do Agente vendas: quando o cliente escreve pro número do
// COBRADOR (número sem agente de IA atribuído) enquanto está em
// Análise/Liberação pagamento, manda essa mensagem fixa UMA vez — texto
// exato pedido pelo usuário, sem reformular — e depois só espera a resposta
// com o horário escolhido pra criar o lembrete. Nenhuma outra mensagem é
// enviada por esse fluxo.
const MENSAGEM_BASE =
  "eae, seguinte vamos agendar a video chamada quando voce estiver na porta da sua casa, " +
  "preciso que me envie antes da video chamada um print que salvou meu numero e depois disso " +
  "quero que voce veja o melhor horario para entrarmos na video chamada to disponivel a partir de ";

function horarioMaisQuinzeMin() {
  // +15min a partir de agora — servidor roda em horário de Brasília (mesma
  // convenção já usada em lib/finance.js e lib/ia.js).
  const d = new Date(Date.now() + 15 * 60 * 1000);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

// `texto`: corpo da mensagem recebida (pode ser vazio, ex.: cliente mandou só
// imagem) — só é usado na etapa de extrair o horário escolhido.
export async function checarNumeroCobrador({ contact, instance, texto, apiKey, currentStage }) {
  const [analise, liberacao] = await Promise.all([
    prisma.stage.findFirst({ where: { name: "Análise" } }),
    prisma.stage.findFirst({ where: { name: "Liberação pagamento" } }),
  ]);
  if (!currentStage || !analise || !liberacao) return;
  // Só faz sentido entre "Análise" (onde essa vídeo chamada é combinada) e
  // "Liberação pagamento" (que ela destrava) — fora dessa janela, ignora.
  if (currentStage.order < analise.order || currentStage.order > liberacao.order) return;

  if (!contact.videoChamadaSolicitadaEm) {
    const { sendWhatsappText } = await import("@/lib/evolution");
    const msg = MENSAGEM_BASE + horarioMaisQuinzeMin() + ".";
    const r = await sendWhatsappText(contact.phone, msg, instance);
    if (r.ok) {
      await prisma.message.create({
        data: { contactId: contact.id, fromMe: true, status: "enviado", instance, kind: "text", body: msg },
      });
      await prisma.contact.update({ where: { id: contact.id }, data: { videoChamadaSolicitadaEm: new Date() } });
    }
    return;
  }

  // Já mandou a mensagem antes e ainda não temos o horário — essa mensagem
  // que chegou agora deve ser a resposta do cliente com o horário escolhido.
  if (!contact.videoChamadaHorario && texto) {
    const { detectarHorarioEscolhido } = await import("@/lib/ia");
    const horario = await detectarHorarioEscolhido(texto, apiKey).catch(() => null);
    // Não entendeu um horário claro nessa mensagem — não responde nada (a IA
    // desse fluxo só manda a mensagem inicial), espera a próxima tentativa.
    if (!horario) return;

    const alvo = new Date();
    alvo.setHours(horario.horas, horario.minutos, 0, 0);

    await prisma.contact.update({ where: { id: contact.id }, data: { videoChamadaHorario: alvo } });

    const lembrete = new Date(alvo.getTime() - 3 * 60 * 1000);
    const horarioFmt = `${String(horario.horas).padStart(2, "0")}:${String(horario.minutos).padStart(2, "0")}`;
    await prisma.task.create({
      data: {
        contactId: contact.id,
        title: `Vídeo chamada às ${horarioFmt} — lembrete de análise`,
        dueDate: lembrete,
        responsavel: analise.autoResponsavel || null,
      },
    });
  }
}
