import { prisma } from "@/lib/prisma";
import { fluxoIa } from "@/lib/fluxoIa";

// Rotina ÚNICA (liga-se pelo campo Config.reprocessarPendentes e ela desliga sozinha):
// responde, uma vez, todos os leads do funil cuja última mensagem é do CLIENTE e que
// ficaram sem resposta.
//  - Novo e nunca falamos com ele → manda a "1 - Mensagem inicial"
//  - Em conversa / Documentação → processa a última mensagem pelo fluxo da IA
//    (tipo, perfis que não atendemos, pedido do próximo documento...)
const ETAPAS = ["Novo", "Em conversa", "Documentação"];
const SETE_DIAS = 7 * 24 * 3600e3;
const pausa = (min, max) => new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));

export async function reprocessarSemResposta() {
  const cfg = await prisma.config.findUnique({
    where: { id: "singleton" },
    select: { reprocessarPendentes: true, iaGlobalPausada: true, mensagemInicialTitulo: true, mensagemInicialInstancia: true },
  });
  if (!cfg?.reprocessarPendentes || cfg.iaGlobalPausada) return;
  // Desliga ANTES de começar: roda uma vez só, mesmo que o servidor reinicie no meio.
  await prisma.config.update({ where: { id: "singleton" }, data: { reprocessarPendentes: false } });

  const { sendTemplateByTitle } = await import("@/lib/ia");
  const etapas = await prisma.stage.findMany({ where: { name: { in: ETAPAS } }, select: { id: true, name: true } });
  const leads = await prisma.contact.findMany({
    where: { excluidoEm: null, iaPausada: false, stageId: { in: etapas.map((e) => e.id) } },
    select: { id: true, tipoCliente: true, stageId: true },
    orderBy: { createdAt: "asc" },
  });

  let respondidos = 0;
  for (const l of leads) {
    const ultima = await prisma.message.findFirst({ where: { contactId: l.id }, orderBy: { createdAt: "desc" } });
    if (!ultima || ultima.fromMe) continue;
    if (Date.now() - ultima.createdAt.getTime() > SETE_DIAS) continue;
    if (!ultima.instance || (cfg.mensagemInicialInstancia && ultima.instance !== cfg.mensagemInicialInstancia)) continue;

    const contact = await prisma.contact.findUnique({ where: { id: l.id } });
    const etapa = etapas.find((e) => e.id === l.stageId);
    const nossas = await prisma.message.count({ where: { contactId: l.id, fromMe: true } });

    try {
      if (etapa?.name === "Novo" && nossas === 0) {
        await sendTemplateByTitle(cfg.mensagemInicialTitulo, contact, ultima.instance);
      } else {
        await fluxoIa({ contact, saved: ultima, instance: ultima.instance, incomingAudio: null, leadNovo: false });
      }
      respondidos++;
    } catch (err) {
      console.error("[reprocessarSemResposta]", contact.name, err?.message || err);
    }
    await pausa(8000, 15000); // espaçamento entre clientes (evita padrão de disparo em massa)
  }
  console.log(`[reprocessarSemResposta] concluído: ${respondidos} lead(s) tratados`);
}
