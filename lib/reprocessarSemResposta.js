import { prisma } from "@/lib/prisma";
import { fluxoIa } from "@/lib/fluxoIa";

// Varredura contínua (roda a cada 5 min): pega qualquer lead do funil cuja ÚLTIMA mensagem é do
// CLIENTE e que a IA ainda não processou — por exemplo porque o servidor reiniciou (deploy) no
// meio do atendimento, ou porque o webhook falhou. Faz a IA se recuperar sozinha.
//  - Novo e nunca falamos com ele → manda a "1 - Mensagem inicial"
//  - Em conversa / Documentação → processa a última mensagem pelo fluxo da IA
// `Contact.iaProcessouAte` guarda a hora da última mensagem do cliente já tratada pela IA, então
// um lead nunca é reprocessado em loop (mesmo quando a IA decide, de propósito, não responder).
const ETAPAS = ["Novo", "Em conversa", "Documentação", "Análise", "Vídeo chamada"];
const SETE_DIAS = 7 * 24 * 3600e3;
const ESPERA_MIN_MS = 3 * 60e3; // dá tempo do fluxo normal terminar antes de considerar "travado"
const LIMITE_POR_RODADA = 12;
const pausa = (min, max) => new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));
let rodando = false;

// Cliente que mandou algo (foto + legenda, resposta que a IA não soube tratar...) e ficou sem NENHUMA resposta nossa: a IA "processou" a mensagem
// mas não pediu o próximo item. Aqui a varredura retoma com o mesmo passo do fluxo (pede o próximo documento ou repete o pendente).
const tentadas = new Set();
const SO_AGRADECE = /^(ok|okay|blz|beleza|certo|combinado|t[aá]|t[aá]\s+bom|show|valeu|obrigad[oa]|muito\s+obrigad[oa]|brigad[oa]|obg|👍|🙏|[\s.!,]+)+$/i;
const AGUARDANDO = /(um\s+instante|j[aá]\s*j[aá]|daqui\s+a\s+pouco|aguard|espera|so\s+um\s+momento|s[oó]\s+um\s+momento)/i;
async function retomarSilenciosos() {
  const { perguntarProximo } = await import("@/lib/fluxoDoc");
  const etapas = await prisma.stage.findMany({ where: { name: { in: ["Em conversa", "Documentação"] } }, select: { id: true } });
  const leads = await prisma.contact.findMany({ where: { excluidoEm: null, iaPausada: false, stageId: { in: etapas.map((e) => e.id) }, iaProcessouAte: { not: null }, docPedido: { not: null } }, select: { id: true, iaProcessouAte: true } });
  let feitos = 0;
  for (const l of leads) {
    if (feitos >= 10) break;
    const ultima = await prisma.message.findFirst({ where: { contactId: l.id }, orderBy: { createdAt: "desc" } });
    if (!ultima || ultima.fromMe || !ultima.instance || tentadas.has(ultima.id)) continue;
    const idade = Date.now() - ultima.createdAt.getTime();
    if (idade < 5 * 60e3 || idade > 24 * 3600e3) continue;
    const corpo = String(ultima.body || "").trim();
    if (ultima.kind === "text" && (SO_AGRADECE.test(corpo) || AGUARDANDO.test(corpo) || corpo.length < 3)) continue;
    tentadas.add(ultima.id);
    try {
      await perguntarProximo({ contactId: l.id, instance: ultima.instance, savedAt: ultima.createdAt, mudou: false, ehMidia: ultima.kind !== "text", retomar: true, jaEnviou: false, texto: corpo });
      feitos++;
      console.log("[varrerSemResposta] cliente sem resposta retomado:", l.id);
    } catch (err) { console.error("[retomarSilenciosos]", err?.message || err); }
  }
}

// Cliente perdido por "Sem CNPJ" que escreveu "só MEI" no mesmo minuto: as duas mensagens são processadas ao mesmo tempo e a 2ª
// ainda não via o lead como perdido. Aqui a varredura confere e devolve o lead para Documentação pedindo o CNPJ.
async function restaurarMeiPerdidos() {
  const lost = await prisma.contact.findMany({
    where: { excluidoEm: null, iaPausada: true, motivoPerda: "Sem CNPJ", perdidoEm: { gte: new Date(Date.now() - 6 * 3600e3) } },
    select: { id: true, name: true, phone: true, perdidoEm: true, stageId: true },
  });
  if (!lost.length) return;
  const doc = await prisma.stage.findFirst({ where: { name: "Documentação" } });
  if (!doc) return;
  for (const c of lost) {
    const msgs = await prisma.message.findMany({ where: { contactId: c.id, fromMe: false, kind: "text", createdAt: { gte: new Date(c.perdidoEm.getTime() - 120e3) } }, select: { body: true, instance: true } });
    const mei = msgs.find((m) => /(\bmei\b|microempreendedor|abri\s+(o\s+)?cnpj)/i.test(m.body || ""));
    if (!mei) continue;
    const resp = "Entendi! O MEI tem CNPJ sim 😊 Pode me enviar o número do CNPJ?";
    if (await prisma.message.count({ where: { contactId: c.id, fromMe: true, body: resp } })) continue;
    await prisma.contact.update({ where: { id: c.id }, data: { stageId: doc.id, motivoPerda: null, perdidoEm: null, iaPausada: false, docPedido: "cnpj", entrouEtapaEm: new Date() } });
    await prisma.etapaLog.create({ data: { contactId: c.id, deEtapa: "Venda perdida", paraEtapa: "Documentação", usuario: "IA", motivo: null } }).catch(() => {});
    const instance = mei.instance || msgs.find((m) => m.instance)?.instance;
    if (instance) {
      const { sendWhatsappText } = await import("@/lib/evolution");
      const r = await sendWhatsappText(c.phone, resp, instance).catch(() => ({ ok: false }));
      await prisma.message.create({ data: { contactId: c.id, enviadoPor: "IA", body: resp, kind: "text", fromMe: true, status: r.simulated ? "simulado" : r.ok ? "enviado" : "erro", instance } }).catch(() => {});
    }
    console.log("[varrerSemResposta] MEI restaurado:", c.name);
  }
}

export async function varrerSemResposta() {
  if (rodando) return;
  const cfg = await prisma.config.findUnique({
    where: { id: "singleton" },
    select: { iaGlobalPausada: true, mensagemInicialTitulo: true, mensagemInicialInstancia: true, mensagemInicialAtiva: true },
  });
  if (!cfg || cfg.iaGlobalPausada) return;
  await restaurarMeiPerdidos().catch((err) => console.error("[meiPerdidos]", err.message));
  await retomarSilenciosos().catch((err) => console.error("[retomarSilenciosos]", err.message));
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
      // Outro número (ex.: Cobrança SP): se já falamos com o lead por qualquer número (saudação, IA...), ele é nosso e é atendido;
      // se nunca falamos, só atende quando a 1ª mensagem é de lead de anúncio.
      if (cfg.mensagemInicialInstancia && ultima.instance !== cfg.mensagemInicialInstancia) {
        const nossasTotal = await prisma.message.count({ where: { contactId: l.id, fromMe: true } });
        if (nossasTotal === 0) {
          const { pareceLeadDeAnuncio } = await import("@/lib/leadAnuncio");
          const primeira = await prisma.message.findFirst({ where: { contactId: l.id, fromMe: false }, orderBy: { createdAt: "asc" }, select: { body: true } });
          if (!pareceLeadDeAnuncio(primeira?.body)) continue;
        }
      }

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
