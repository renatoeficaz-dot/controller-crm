import { prisma } from "@/lib/prisma";
import { atingiuLimite } from "@/lib/aquecimento";
import { ondePodeReceberAutomatico } from "@/lib/envioAutomatico";

const UMA_HORA = 60 * 60 * 1000;
const TRINTA_HORAS = 30 * UMA_HORA;
const ETAPAS = ["Novo", "Em conversa"];

// Roda a cada poucos minutos (ver instrumentation.js). Lead em "Novo" ou "Em
// conversa" cuja ÚLTIMA mensagem foi nossa há mais de 1h (cliente não
// respondeu) recebe um "?" para tentar reengajar. Não repete: depois de
// enviado, o próprio "?" vira a última mensagem e a condição deixa de bater
// até o cliente responder e a gente falar de novo. Passou de 30h, o lead vai
// pra Venda perdida (lib/autoVendaPerdida.js) — então nem tenta além disso.
export async function checarFollowUp1h() {
  const cfg = await prisma.config.findUnique({
    where: { id: "singleton" },
    select: { iaGlobalPausada: true, mensagemInicialInstancia: true },
  });
  if (cfg?.iaGlobalPausada) return;

  const etapas = await prisma.stage.findMany({ where: { name: { in: ETAPAS } }, select: { id: true } });
  if (!etapas.length) return;

  const agora = Date.now();
  const candidatos = await prisma.contact.findMany({
    where: {
      ...ondePodeReceberAutomatico(),
      iaPausada: false,
      stageId: { in: etapas.map((e) => e.id) },
      messages: { some: { fromMe: true, createdAt: { lte: new Date(agora - UMA_HORA), gte: new Date(agora - TRINTA_HORAS) } } },
    },
    select: { id: true, phone: true },
  });
  if (!candidatos.length) return;

  // Última mensagem de cada candidato numa consulta só.
  const ultimas = await prisma.message.findMany({
    where: { contactId: { in: candidatos.map((c) => c.id) } },
    orderBy: { createdAt: "desc" },
    select: { contactId: true, fromMe: true, body: true, createdAt: true, instance: true },
  });
  const ultimaPorContato = new Map();
  for (const m of ultimas) if (!ultimaPorContato.has(m.contactId)) ultimaPorContato.set(m.contactId, m);

  const numeros = await prisma.whatsappNumber.findMany();
  const { sendWhatsappText } = await import("@/lib/evolution");
  let enviouAlgum = false;

  for (const contact of candidatos) {
    const last = ultimaPorContato.get(contact.id);
    if (!last || !last.fromMe || last.body === "?" || !last.instance) continue;
    if (last.createdAt.getTime() > agora - UMA_HORA) continue;
    // Só no número de vendas configurado (vazio = qualquer número)
    if (cfg?.mensagemInicialInstancia && last.instance !== cfg.mensagemInicialInstancia) continue;
    const numero = numeros.find((n) => n.instance === last.instance);
    if (!numero || (await atingiuLimite(numero))) continue;

    // Espaçamento aleatório entre envios — evita padrão de disparo em massa.
    if (enviouAlgum) await new Promise((r) => setTimeout(r, 5000 + Math.random() * 10000));
    enviouAlgum = true;

    const result = await sendWhatsappText(contact.phone, "?", last.instance);
    await prisma.message.create({
      data: {
        enviadoPor: "IA",
        contactId: contact.id,
        body: "?",
        kind: "text",
        fromMe: true,
        status: result.simulated ? "simulado" : result.ok ? "enviado" : "erro",
        instance: last.instance,
      },
    });
  }
}
