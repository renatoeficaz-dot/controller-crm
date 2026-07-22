import { prisma } from "@/lib/prisma";
import { ufFromPhone } from "@/lib/ddd";

function hojeUTC() {
  const hoje = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD local
  return new Date(hoje + "T00:00:00.000Z");
}

// Subtrai 1h30 de "HH:MM" (horário limite de pagamento) pra achar o horário alvo do lembrete.
function horaAlvo(pagamentoHoraLimite) {
  const [h, m] = (pagamentoHoraLimite || "10:00").split(":").map(Number);
  let total = h * 60 + (m || 0) - 90;
  if (total < 0) total += 24 * 60;
  return { h: Math.floor(total / 60), m: total % 60 };
}

// Roda a cada poucos minutos (ver instrumentation.js). Só envia lembrete quando
// o horário atual bate com "1h30 antes do horário limite de pagamento" — usa
// uma janela de tolerância pra não perder o disparo entre execuções do intervalo.
export async function checarLembretesCobranca() {
  const cfg = await prisma.config.findUnique({ where: { id: "singleton" } });
  const alvo = horaAlvo(cfg?.pagamentoHoraLimite);
  const agora = new Date();
  const horaAtualMin = agora.getHours() * 60 + agora.getMinutes();
  const alvoMin = alvo.h * 60 + alvo.m;
  if (Math.abs(horaAtualMin - alvoMin) > 5) return;

  const recebimento = await prisma.stage.findFirst({ where: { name: "Recebimento" } });
  if (!recebimento) return;

  const hoje = hojeUTC();
  const contatos = await prisma.contact.findMany({
    where: {
      stageId: recebimento.id,
      parcelas: { some: { paid: false, dueDate: { lte: hoje } } },
    },
  });
  if (!contatos.length) return;

  const numeros = await prisma.whatsappNumber.findMany({
    where: { estadosCobranca: { not: null }, mensagemCobranca: { not: null } },
  });
  if (!numeros.length) return;

  const { sendWhatsappText } = await import("@/lib/evolution");

  let enviouAlgum = false;
  for (const contact of contatos) {
    const already = await prisma.lembreteCobrancaLog
      .findUnique({ where: { contactId_dia: { contactId: contact.id, dia: hoje } } })
      .catch(() => null);
    if (already) continue;

    // Espaçamento aleatório (5-15s) entre envios — mandar tudo em sequência sem
    // pausa é a assinatura de spam que o WhatsApp detecta e usa pra banir na hora.
    if (enviouAlgum) await new Promise((r) => setTimeout(r, 5000 + Math.random() * 10000));
    enviouAlgum = true;

    const uf = ufFromPhone(contact.phone);
    if (!uf) continue;
    const numero = numeros.find((n) =>
      (n.estadosCobranca || "")
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .includes(uf)
    );
    if (!numero) continue;

    const result = await sendWhatsappText(contact.phone, numero.mensagemCobranca, numero.instance);
    await prisma.message.create({
      data: {
        contactId: contact.id,
        body: numero.mensagemCobranca,
        kind: "text",
        fromMe: true,
        status: result.simulated ? "simulado" : result.ok ? "enviado" : "erro",
        instance: numero.instance,
      },
    });
    // Se der erro no envio real, não marca como enviado — deixa tentar de novo
    // na próxima checagem (dentro da mesma janela de tolerância).
    if (result.ok) {
      await prisma.lembreteCobrancaLog.create({ data: { contactId: contact.id, dia: hoje } }).catch(() => {});
    }
  }
}
