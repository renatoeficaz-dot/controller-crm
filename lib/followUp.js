import { prisma } from "@/lib/prisma";
import { atingiuLimite } from "@/lib/aquecimento";
import { ondePodeReceberAutomatico } from "@/lib/envioAutomatico";

const UMA_HORA = 60 * 60 * 1000;
const TRINTA_HORAS = 30 * UMA_HORA;
const ETAPAS = ["Novo", "Em conversa", "Documentação"];
export const FOLLOW_2 = "Vai querer dar segmento?";
export const FOLLOW_3 = "Olá você gostaria de seguir com o atendimento para te auxiliar em capital de giro?";

// Roda a cada poucos minutos (ver instrumentation.js). Lead em "Novo" ou "Em
// conversa" cuja ÚLTIMA mensagem foi nossa há mais de 1h (cliente não
// respondeu) recebe um "?" para tentar reengajar. Não repete: depois de
// enviado, o próprio "?" vira a última mensagem e a condição deixa de bater
// até o cliente responder e a gente falar de novo. Passou de 30h, o lead vai
// pra Venda perdida (lib/autoVendaPerdida.js) — então nem tenta além disso.
let rodandoFollow = false;
export async function checarFollowUp1h() {
  if (rodandoFollow) return; // rodadas simultâneas já mandaram follow-up em duplicidade
  rodandoFollow = true;
  try {
    await executar();
    await retomarAcenos().catch((err) => console.error("[followUp] acenos:", err.message));
  } finally {
    rodandoFollow = false;
  }
}

async function executar() {
  const cfg = await prisma.config.findUnique({
    where: { id: "singleton" },
    select: { iaGlobalPausada: true, mensagemInicialInstancia: true },
  });
  if (cfg?.iaGlobalPausada) return;
  const { vendasConectado } = await import("@/lib/instanciaIa");
  if (!(await vendasConectado())) return; // número fora do ar: o cliente não recebe nada, não adianta avançar a sequência

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
    where: { contactId: { in: candidatos.map((c) => c.id) }, NOT: { fromMe: true, status: "erro" } },
    orderBy: { createdAt: "desc" },
    select: { contactId: true, fromMe: true, body: true, createdAt: true, instance: true, enviadoPor: true },
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
    // Lead que a IA já está atendendo por outro número (ex.: cliente chamou a Cobrança SP) também recebe o follow-up,
    // pelo mesmo número em que a conversa acontece.
    if (cfg?.mensagemInicialInstancia && last.instance !== cfg.mensagemInicialInstancia && last.enviadoPor !== "IA") continue;
    const numero = numeros.find((n) => n.instance === last.instance);
    if (!numero || (await atingiuLimite(numero))) continue;

    // Espaçamento aleatório entre envios — evita padrão de disparo em massa.
    if (enviouAlgum) await new Promise((r) => setTimeout(r, 5000 + Math.random() * 10000));
    enviouAlgum = true;

    const { instanciaDaIa } = await import("@/lib/instanciaIa");
    const instEnvio = await instanciaDaIa(last.instance);
    const result = await sendWhatsappText(contact.phone, texto, instEnvio);
    await prisma.message.create({
      data: {
        enviadoPor: "IA",
        contactId: contact.id,
        body: texto,
        kind: "text",
        fromMe: true,
        status: result.simulated ? "simulado" : result.ok ? "enviado" : "erro",
        instance: instEnvio,
      },
    });
  }
}

// Cliente respondeu só com um aceno ("ok", "um instante", "👍", "já mando") e depois sumiu: a IA não responde a aceno, e como a
// última mensagem era do cliente o follow-up acima nunca disparava — o lead ficava parado para sempre. Passadas 3h do aceno,
// manda o "?" e a sequência normal (FOLLOW_2 → FOLLOW_3) continua sozinha.
const ACENO_RE = /^\s*(?:(?:ok(?:ay)?|blz|beleza|certo|combinado|t[aá](?:\s+bom)?|sim|no\s+aguardo|aguardo|(?:s[oó]\s+)?um\s+(?:instante|minuto|momento)|j[aá]\s+(?:vou\s+)?(?:mando|envio)|vou\s+(?:mandar|enviar)|(?:muito\s+)?obrigad[oa]|obg|valeu|👍|🙏)[\s.!,\u{1F3FB}-\u{1F3FF}]*)+$/iu;
export async function retomarAcenos() {
  const cfg = await prisma.config.findUnique({ where: { id: "singleton" }, select: { iaGlobalPausada: true, mensagemInicialInstancia: true } });
  if (cfg?.iaGlobalPausada) return;
  const { vendasConectado } = await import("@/lib/instanciaIa");
  if (!(await vendasConectado())) return;
  const etapas = await prisma.stage.findMany({ where: { name: { in: ETAPAS } }, select: { id: true } });
  const agora = Date.now();
  const candidatos = await prisma.contact.findMany({
    where: { ...ondePodeReceberAutomatico(), iaPausada: false, stageId: { in: etapas.map((e) => e.id) }, docPedido: { not: "concluido" } },
    select: { id: true, phone: true },
  });
  const { sendWhatsappText } = await import("@/lib/evolution");
  const { instanciaDaIa } = await import("@/lib/instanciaIa");
  let enviou = false;
  for (const c of candidatos) {
    const last = await prisma.message.findFirst({ where: { contactId: c.id, NOT: { fromMe: true, status: "erro" } }, orderBy: { createdAt: "desc" }, select: { fromMe: true, kind: true, body: true, createdAt: true, instance: true, enviadoPor: true } });
    if (!last) continue;
    const idadeUlt = agora - last.createdAt.getTime();
    if (last.fromMe) {
      // Sequência interrompida: a última mensagem é nossa, não é parte do "?" → FOLLOW_2 → FOLLOW_3 e já passou da janela de 30h do
      // follow-up (ex.: lembrete de horário que falhou, número fora do ar). Recomeça a sequência com o "?".
      if (!["IA", "Automático", "Agendada"].includes(last.enviadoPor || "IA") || idadeUlt < TRINTA_HORAS || last.body === "?" || last.body === FOLLOW_2 || last.body === FOLLOW_3) continue;
    } else {
      if (last.kind !== "text" || idadeUlt < 3 * UMA_HORA) continue;
      if (!ACENO_RE.test(String(last.body || ""))) continue;
    }
    if (await prisma.mensagemAgendada.count({ where: { contactId: c.id, enviado: false } })) continue; // já há um contato combinado
    const ant = await prisma.message.findFirst({ where: { contactId: c.id, fromMe: true }, orderBy: { createdAt: "desc" }, select: { instance: true } });
    const inst = await instanciaDaIa(ant?.instance || last.instance || cfg.mensagemInicialInstancia);
    if (enviou) await new Promise((r) => setTimeout(r, 5000 + Math.random() * 10000));
    enviou = true;
    const r = await sendWhatsappText(c.phone, "?", inst);
    await prisma.message.create({ data: { enviadoPor: "IA", contactId: c.id, body: "?", kind: "text", fromMe: true, status: r.simulated ? "simulado" : r.ok ? "enviado" : "erro", instance: inst } });
  }
}
