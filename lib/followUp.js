import { prisma } from "@/lib/prisma";
import { atingiuLimite } from "@/lib/aquecimento";
import { ondePodeReceberAutomatico } from "@/lib/envioAutomatico";

const UMA_HORA = 60 * 60 * 1000;
const TRINTA_HORAS = 30 * UMA_HORA;
const ETAPAS = ["Novo", "Em conversa"];
const FOLLOW_2 = "Vai querer dar segmento?";
const FOLLOW_3 = "Olá você gostaria de seguir com o atendimento para te auxiliar em capital de giro?";

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
    if (!last || !last.fromMe || last.body === FOLLOW_3 || !last.instance) continue;
    // Sequência: "?" (1h sem resposta) → 2h depois FOLLOW_2 → 22h depois FOLLOW_3. Se o cliente responder, o fluxo normal segue.
    const idade = agora - last.createdAt.getTime();
    let texto;
    if (last.body === "?") { if (idade < 2 * UMA_HORA) continue; texto = FOLLOW_2; }
    else if (last.body === FOLLOW_2) { if (idade < 22 * UMA_HORA) continue; texto = FOLLOW_3; }
    else { if (idade < UMA_HORA) continue; texto = "?"; }
    // Só no número de vendas configurado (vazio = qualquer número)
    if (cfg?.mensagemInicialInstancia && last.instance !== cfg.mensagemInicialInstancia) continue;
    const numero = numeros.find((n) => n.instance === last.instance);
    if (!numero || (await atingiuLimite(numero))) continue;

    // Espaçamento aleatório entre envios — evita padrão de disparo em massa.
    if (enviouAlgum) await new Promise((r) => setTimeout(r, 5000 + Math.random() * 10000));
    enviouAlgum = true;

    const result = await sendWhatsappText(contact.phone, texto, last.instance);
    await prisma.message.create({
      data: {
        enviadoPor: "IA",
        contactId: contact.id,
        body: texto,
        kind: "text",
        fromMe: true,
        status: result.simulated ? "simulado" : result.ok ? "enviado" : "erro",
        instance: last.instance,
      },
    });
  }
}
