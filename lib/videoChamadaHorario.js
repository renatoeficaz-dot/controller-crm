import { prisma } from "@/lib/prisma";

// Lead em "Vídeo chamada" que chama o número de cobrança SP: a 1ª mensagem recebe a pergunta do melhor horário
// (09:00–11:00 ou 19:00–20:30) e, quando ele responde um horário, a tarefa "Vídeo chamada com o cliente" passa para esse horário.
export const PERGUNTA_HORARIO_VIDEO = "EAE, Qual melhor horario para voce fazer a video chamada dentro desses horarios? 09:00 as 11:00 ou das 19:00 as 20:30";
const TITULO_TAREFA = "Vídeo chamada com o cliente";
const INSTANCIA_COBRANCA_SP = "cobranca-sp";

const dentroDaJanela = (min) => (min >= 9 * 60 && min <= 11 * 60) || (min >= 19 * 60 && min <= 20 * 60 + 30);
const pad = (n) => String(n).padStart(2, "0");

// Entende "9", "9h", "9:30", "às 10", "19h30", "7 da noite", "8 e meia da noite"... Devolve minutos desde 00:00 ou null.
export function horarioDito(texto) {
  const t = String(texto || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  let h = null;
  let m = 0;
  let r = t.match(/\b(\d{1,2})\s*(?:h|hs|horas?|:)\s*(\d{2})?\b/) || t.match(/\b(?:as|a|para|pras|umas)\s+(\d{1,2})(?:\s*(?:e\s+)?(\d{2}))?\b/) || t.match(/\b(\d{1,2})\s*(?:e\s+meia\s+)?(?:da\s+(?:noite|manha|tarde)|pm|am)\b/) || t.match(/^\s*(\d{1,2})\s*$/);
  if (r) {
    h = Number(r[1]);
    m = r[2] ? Number(r[2]) : 0;
  }
  if (h == null) return null;
  if (/\bmeia\b/.test(t) && !r?.[2]) m = 30;
  if (h > 23 || m > 59) return null;
  const noite = /\b(noite|pm)\b/.test(t);
  const manha = /\b(manha|am)\b/.test(t);
  if (h < 12) {
    if (noite || (!manha && h <= 8)) h += 12; // "7", "8" soltos = noite (as janelas são 9–11 e 19–20:30)
  }
  return h * 60 + m;
}

async function enviarDaCobranca(contact, instance, body) {
  const { sendWhatsappText } = await import("@/lib/evolution");
  const r = await sendWhatsappText(contact.phone, body, instance).catch(() => ({ ok: false }));
  await prisma.message.create({
    data: { contactId: contact.id, enviadoPor: "Automático", body, kind: "text", fromMe: true, status: r.simulated ? "simulado" : r.ok ? "enviado" : "erro", instance },
  });
}

// Devolve true quando tratou a mensagem (perguntou ou confirmou o horário).
export async function tratarVideoChamadaCobranca({ contact, saved, instance, text }) {
  if (!contact?.stageId || String(instance || "").toLowerCase() !== INSTANCIA_COBRANCA_SP) return false;
  const stage = await prisma.stage.findUnique({ where: { id: contact.stageId }, select: { name: true } });
  if (stage?.name !== "Vídeo chamada") return false;

  const anteriores = await prisma.message.findMany({
    where: { contactId: contact.id, instance, id: { not: saved.id } },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { fromMe: true, body: true, createdAt: true },
  });

  // 1ª mensagem desse lead neste número: pergunta o melhor horário.
  if (!anteriores.length) {
    await enviarDaCobranca(contact, instance, PERGUNTA_HORARIO_VIDEO);
    return true;
  }

  // Respondendo a pergunta: lê o horário e ajusta a tarefa da vídeo chamada.
  const ultima = anteriores[0];
  const perguntou = ultima.fromMe && ultima.body === PERGUNTA_HORARIO_VIDEO && Date.now() - new Date(ultima.createdAt).getTime() < 48 * 3600e3;
  const repetiu = ultima.fromMe && /^Dentro desses horarios/.test(String(ultima.body || ""));
  if (!(perguntou || repetiu) || saved.kind !== "text" || !String(text || "").trim()) return false;

  const min = horarioDito(text);
  if (min == null) return false;
  if (!dentroDaJanela(min)) {
    await enviarDaCobranca(contact, instance, "Dentro desses horarios: 09:00 as 11:00 ou das 19:00 as 20:30. Qual voce prefere?");
    return true;
  }

  // Data: "amanhã" ou, senão, hoje se o horário ainda não passou (Brasília), senão amanhã.
  const agoraBR = new Date(Date.now() - 3 * 3600e3);
  const hoje = agoraBR.toISOString().slice(0, 10);
  const minAgora = agoraBR.getUTCHours() * 60 + agoraBR.getUTCMinutes();
  const quer = String(text).toLowerCase();
  let dia = hoje;
  if (/amanh/.test(quer) || min <= minAgora) {
    const d = new Date(agoraBR);
    d.setUTCDate(d.getUTCDate() + 1);
    dia = d.toISOString().slice(0, 10);
  }
  const hh = pad(Math.floor(min / 60));
  const mm = pad(min % 60);
  const quando = new Date(`${dia}T${hh}:${mm}:00-03:00`);

  let tarefa = await prisma.task.findFirst({ where: { contactId: contact.id, title: TITULO_TAREFA, done: false }, orderBy: { dueDate: "asc" } });
  if (!tarefa) {
    const { criarTarefaVideoChamada } = await import("@/lib/tarefaVideoChamada");
    await criarTarefaVideoChamada(contact.id).catch(() => {});
    tarefa = await prisma.task.findFirst({ where: { contactId: contact.id, title: TITULO_TAREFA, done: false }, orderBy: { dueDate: "asc" } });
  }
  if (tarefa) await prisma.task.update({ where: { id: tarefa.id }, data: { dueDate: quando, notes: `Horário combinado com o cliente: ${hh}:${mm}` } });
  const rotuloDia = dia === hoje ? "hoje" : "amanhã";
  await enviarDaCobranca(contact, instance, `Combinado! Te chamo ${rotuloDia} às ${hh}:${mm} 😊`);
  return true;
}
