import { prisma } from "@/lib/prisma";
import { fluxoIa } from "@/lib/fluxoIa";

// Varredura contínua (roda a cada 5 min): pega qualquer lead do funil cuja ÚLTIMA mensagem é do
// CLIENTE e que a IA ainda não processou — por exemplo porque o servidor reiniciou (deploy) no
// meio do atendimento, ou porque o webhook falhou. Faz a IA se recuperar sozinha.
//  - Novo e nunca falamos com ele → manda a "1 - Mensagem inicial"
//  - Em conversa / Documentação → processa a última mensagem pelo fluxo da IA
// `Contact.iaProcessouAte` guarda a hora da última mensagem do cliente já tratada pela IA, então
// um lead nunca é reprocessado em loop (mesmo quando a IA decide, de propósito, não responder).
const ETAPAS = ["Novo", "Em conversa", "Documentação"];
const SETE_DIAS = 7 * 24 * 3600e3;
const ESPERA_MIN_MS = 3 * 60e3; // dá tempo do fluxo normal terminar antes de considerar "travado"
const LIMITE_POR_RODADA = 12;
const pausa = (min, max) => new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));
let rodando = false;

export async function varrerSemResposta() {
  if (rodando) return;
  const cfg = await prisma.config.findUnique({
    where: { id: "singleton" },
    select: { iaGlobalPausada: true, mensagemInicialTitulo: true, mensagemInicialInstancia: true, mensagemInicialAtiva: true },
  });
  if (!cfg || cfg.iaGlobalPausada) return;
  rodando = true;
  try {
    const { sendTemplateByTitle } = await import("@/lib/ia");
    const etapas = await prisma.stage.findMany({ where: { name: { in: ETAPAS } }, select: { id: true, name: true } });
    const leads = await prisma.contact.findMany({
      where: { excluidoEm: null, iaPausada: false, stageId: { in: etapas.map((e) => e.id) } },
      select: { id: true, stageId: true, iaProcessouAte: true },
      orderBy: { createdAt: "asc" },
    });

    let tratados = 0;
    for (const l of leads) {
      if (tratados >= LIMITE_POR_RODADA) break;
      const ultima = await prisma.message.findFirst({ where: { contactId: l.id }, orderBy: { createdAt: "desc" } });
      if (!ultima || ultima.fromMe) continue;
      const idade = Date.now() - ultima.createdAt.getTime();
      if (idade < ESPERA_MIN_MS || idade > SETE_DIAS) continue;
      if (l.iaProcessouAte && l.iaProcessouAte >= ultima.createdAt) continue;
      if (!ultima.instance) continue;
      // Outro número (ex.: Cobrança SP): só se a IA já atendeu esse lead por lá.
      if (cfg.mensagemInicialInstancia && ultima.instance !== cfg.mensagemInicialInstancia && !(await prisma.message.count({ where: { contactId: l.id, fromMe: true, enviadoPor: "IA" } }))) continue;

      const contact = await prisma.contact.findUnique({ where: { id: l.id } });
      const etapa = etapas.find((e) => e.id === l.stageId);
      const nossas = await prisma.message.count({ where: { contactId: l.id, fromMe: true } });

      try {
        if (etapa?.name === "Novo" && nossas === 0) {
          if (cfg.mensagemInicialAtiva) await sendTemplateByTitle(cfg.mensagemInicialTitulo, contact, ultima.instance);
          await prisma.contact.update({ where: { id: l.id }, data: { iaProcessouAte: ultima.createdAt } });
        } else {
          let incomingAudio = null;
          if (ultima.kind === "audio" && ultima.mediaUrl) {
            const { readMediaAsBase64 } = await import("@/lib/mediaStorage");
            const base64 = await readMediaAsBase64(ultima.mediaUrl).catch(() => null);
            if (base64) incomingAudio = { base64, mimetype: ultima.mimeType || "audio/ogg" };
          }
          await fluxoIa({ contact, saved: ultima, instance: ultima.instance, incomingAudio, leadNovo: false });
        }
        tratados++;
      } catch (err) {
        console.error("[varrerSemResposta]", contact.name, err?.message || err);
      }
      await pausa(8000, 15000); // espaçamento entre clientes (evita padrão de disparo em massa)
    }
    if (tratados) console.log(`[varrerSemResposta] ${tratados} lead(s) retomados`);
  } finally {
    rodando = false;
  }
}
