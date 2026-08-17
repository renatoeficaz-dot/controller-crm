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

    // Mídia anexada direto neste agendamento (áudio gravado / imagem
    // escolhida na hora) tem prioridade sobre a do template — quando as duas
    // existem junto com texto, viram DUAS mensagens separadas, na ordem
    // escolhida (ordemMidia), em vez da legenda única de antes.
    const midiaPropria = !!m.midiaUrl;
    const midiaUrl = midiaPropria ? m.midiaUrl : m.template?.mediaUrl;
    const midiaTipo = midiaPropria ? m.midiaTipo : m.template?.mediaType;
    const midiaMimetype = midiaPropria ? m.midiaMimetype : m.template?.mediaMimetype;
    const midiaFileName = midiaPropria ? m.midiaFileName : m.template?.mediaFileName;
    const textoFinal = interpolarVariaveis(m.template?.body || m.corpo || "", m.contact);
    const temTexto = !!textoFinal.trim();
    const temMidia = !!(midiaUrl && midiaTipo);

    async function registrarMensagem({ body, kind, mediaUrl: mUrl, mimeType, fileName, status }) {
      await prisma.message.create({
        data: {
          contactId: m.contactId,
          body,
          kind,
          mediaUrl: mUrl || null,
          mimeType: mimeType || null,
          fileName: fileName || null,
          fromMe: true,
          status: status?.simulated ? "simulado" : status?.ok ? "enviado" : "erro",
          instance: m.numero.instance,
        },
      });
    }

    async function enviarSoTexto() {
      const r = await sendWhatsappText(m.contact.phone, textoFinal, m.numero.instance);
      await registrarMensagem({ body: textoFinal, kind: "text", status: r });
      return r;
    }

    // comLegenda: comportamento antigo (mídia de template com texto junto
    // numa mensagem só). Sem legenda: mídia sozinha, o texto vai à parte.
    async function enviarSoMidia(comLegenda) {
      const base64 = await readMediaAsBase64(midiaUrl);
      const legenda = comLegenda ? textoFinal : "";
      let r;
      if (midiaTipo === "audio") {
        r = await sendWhatsappAudio(m.contact.phone, base64, m.numero.instance);
      } else {
        r = await sendWhatsappMedia(
          m.contact.phone,
          { base64, mimetype: midiaMimetype, fileName: midiaFileName, caption: legenda, mediatype: midiaTipo },
          m.numero.instance
        );
      }
      await registrarMensagem({ body: legenda, kind: midiaTipo, mediaUrl: midiaUrl, mimeType: midiaMimetype, fileName: midiaFileName, status: r });
      return r;
    }

    try {
      let result;
      if (temMidia && midiaPropria && temTexto) {
        const primeiro = m.ordemMidia === "antes" ? enviarSoMidia : enviarSoTexto;
        const segundo = m.ordemMidia === "antes" ? enviarSoTexto : enviarSoMidia;
        result = await primeiro(false);
        if (result?.ok !== false) {
          await new Promise((r) => setTimeout(r, 2500 + Math.random() * 2000));
          result = await segundo(false);
        }
      } else if (temMidia) {
        // só mídia (própria sem texto, ou vinda de template) — legenda junto
        // quando for imagem/documento, igual sempre foi.
        result = await enviarSoMidia(true);
      } else {
        result = await enviarSoTexto();
      }
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
