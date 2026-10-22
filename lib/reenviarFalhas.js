import { prisma } from "@/lib/prisma";

// Mensagem automática (IA/Automático/Agendada) que falhou no envio (instância fora do ar, rede) nunca chegou ao cliente: o lead de
// "perfil não aprovado" ficava sem resposta e o aviso de "valor enviado" se perdia. A varredura reenvia, uma vez por ciclo, o que falhou
// e continua fazendo sentido: nada mais foi dito no chat depois dela (nem pelo cliente, nem por nós) e não é um lembrete/follow-up.
const AUTOMATICOS = ["IA", "Automático", "Agendada"];
const EFEMERA = /^\s*\?\s*$|Vai querer dar segmento|gostaria de seguir com o atendimento|Chegou o horário que combinamos|Tivemos uma instabilidade/i;

export async function reenviarFalhas({ desdeHoras = 240, minMin = 10, maxEnvios = 15, pausaMs = 6000 } = {}) {
  const { sendWhatsappText } = await import("@/lib/evolution");
  const candidatas = await prisma.message.findMany({
    where: {
      fromMe: true, status: "erro", kind: "text", enviadoPor: { in: AUTOMATICOS },
      createdAt: { gte: new Date(Date.now() - desdeHoras * 3600e3), lte: new Date(Date.now() - minMin * 60e3) },
    },
    include: { contact: { select: { id: true, phone: true, excluidoEm: true } } },
    orderBy: { createdAt: "asc" },
  });
  const falhasSeguidas = new Map();
  let enviados = 0;
  const feitos = [];
  for (const m of candidatas) {
    if (enviados >= maxEnvios) break;
    if (!m.contact || m.contact.excluidoEm || !m.body || EFEMERA.test(m.body)) continue;
    const inst = m.instance || "-";
    if ((falhasSeguidas.get(inst) || 0) >= 3) continue; // instância ainda fora do ar: tenta de novo no próximo ciclo
    const depois = await prisma.message.count({ where: { contactId: m.contactId, id: { not: m.id }, createdAt: { gt: m.createdAt }, NOT: { fromMe: true, status: "erro" } } });
    if (depois) continue;
    const r = await sendWhatsappText(m.contact.phone, m.body, m.instance).catch(() => ({ ok: false }));
    if (!r.ok) {
      // Resposta de erro da API (número sem WhatsApp, rejeitado...) é definitiva: marca "falhou" e não tenta de novo. Falha de rede/instância fora do ar tenta no próximo ciclo.
      if (/respondeu|exists|not\s*found|invalid|bloqueado|vazio|sem telefone/i.test(String(r.error || ""))) {
        await prisma.message.update({ where: { id: m.id }, data: { status: "falhou" } }).catch(() => {});
        console.log("[reenviarFalhas] falha definitiva:", m.contactId, String(r.error).slice(0, 80));
      } else {
        falhasSeguidas.set(inst, (falhasSeguidas.get(inst) || 0) + 1);
        console.log("[reenviarFalhas] falha temporária:", String(r.error || "").slice(0, 80));
      }
      continue;
    }
    falhasSeguidas.set(inst, 0);
    await prisma.message.update({ where: { id: m.id }, data: { status: r.simulated ? "simulado" : "enviado", waMessageId: r.data?.key?.id || null } }).catch(() => {});
    enviados++;
    feitos.push(m.contactId);
    if (pausaMs) await new Promise((res) => setTimeout(res, pausaMs));
  }
  if (enviados) console.log("[reenviarFalhas] reenviadas:", enviados);
  return { enviados, candidatas: candidatas.length };
}
