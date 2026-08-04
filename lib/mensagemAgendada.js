import { prisma } from "@/lib/prisma";
import { podeReceberAutomatico } from "@/lib/envioAutomatico";

// Dispara as mensagens agendadas cujo horário já chegou. Roda a cada 5 min
// (instrumentation.js), então o atraso máximo entre o horário marcado e o
// envio real é de uns 5 minutos — aceitável pra esse tipo de lembrete.
export async function enviarMensagensAgendadas() {
  const { sendWhatsappText, sendWhatsappMedia, sendWhatsappAudio } = await import("@/lib/evolution");
  const { readMediaAsBase64 } = await import("@/lib/mediaStorage");
  const { interpolarVariaveis } = await import("@/lib/variaveis");
  const { atingiuLimiteHora } = await import("@/lib/aquecimento");

  const pendentes = await prisma.mensagemAgendada.findMany({
    where: { enviado: false, dataHora: { lte: new Date() } },
    include: { contact: true, numero: true, template: true },
    take: 30, // um lote por checagem — não estoura tudo de uma vez se acumular
  });

  let enviouAlgum = false;
  for (const m of pendentes) {
    if (!m.contact?.phone) {
      await prisma.mensagemAgendada.update({ where: { id: m.id }, data: { enviado: true, erro: "Lead sem telefone." } });
      continue;
    }

    // Lead excluído ou em "não perturbar" não recebe o agendamento. Fica
    // marcado como resolvido com o motivo, senão a fila tentaria pra sempre.
    if (!podeReceberAutomatico(m.contact)) {
      await prisma.mensagemAgendada.update({
        where: { id: m.id },
        data: { enviado: true, erro: m.contact.excluidoEm ? "Lead excluído." : "Lead em \"não perturbar\"." },
      });
      continue;
    }

    // Respeita o teto de envios por hora do número, igual as outras rotinas —
    // sem isso um lote grande de agendamentos furava a proteção contra ban.
    if (await atingiuLimiteHora(m.numero)) continue;

    if (enviouAlgum) await new Promise((r) => setTimeout(r, 5000 + Math.random() * 10000));
    enviouAlgum = true;

    try {
      let result;
      const texto = interpolarVariaveis(m.template?.body || m.corpo || "", m.contact);
      const tipo = m.template?.mediaType;
      if (tipo === "audio" && m.template.mediaUrl) {
        result = await sendWhatsappAudio(m.contact.phone, await readMediaAsBase64(m.template.mediaUrl), m.numero.instance);
      } else if ((tipo === "image" || tipo === "document") && m.template.mediaUrl) {
        result = await sendWhatsappMedia(
          m.contact.phone,
          {
            base64: await readMediaAsBase64(m.template.mediaUrl),
            mimetype: m.template.mediaMimetype,
            fileName: m.template.mediaFileName,
            caption: texto,
            mediatype: tipo,
          },
          m.numero.instance
        );
      } else {
        result = await sendWhatsappText(m.contact.phone, texto, m.numero.instance);
      }
      await prisma.message.create({
        data: {
          contactId: m.contactId,
          body: texto,
          kind: tipo === "audio" || tipo === "image" || tipo === "document" ? tipo : "text",
          mediaUrl: m.template?.mediaUrl || null,
          mimeType: m.template?.mediaMimetype || null,
          fileName: m.template?.mediaFileName || null,
          fromMe: true,
          status: result?.simulated ? "simulado" : result?.ok ? "enviado" : "erro",
          instance: m.numero.instance,
        },
      });
      await prisma.mensagemAgendada.update({
        where: { id: m.id },
        data: { enviado: true, enviadoEm: new Date(), erro: result?.ok ? null : "Falha no envio." },
      });
    } catch (e) {
      await prisma.mensagemAgendada.update({ where: { id: m.id }, data: { enviado: true, erro: e.message } });
    }
  }
  return pendentes.length;
}
