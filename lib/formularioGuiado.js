import { prisma } from "@/lib/prisma";

// Modo "perguntar" de coleta de dados (item 3): em vez de mandar um link de
// formulário, a própria conversa vai perguntando um campo de cada vez —
// determinístico (não passa pela IA), pra nunca interpretar errado uma
// resposta estruturada.
export async function enviarPerguntaGuiada(contact, campanha, instance) {
  const campos = JSON.parse(campanha.formCampos || "[]");
  if (!campos.length) return false;

  const { sendWhatsappText } = await import("@/lib/evolution");
  const pergunta = campos[0].label;
  const texto = `Oi! Antes de continuar, preciso de algumas informações rápidas.\n\n${pergunta}`;
  const result = await sendWhatsappText(contact.phone, texto, instance).catch(() => ({ ok: false }));
  await prisma.message.create({
    data: { contactId: contact.id, body: texto, kind: "text", fromMe: true, status: result.ok ? "enviado" : "erro", instance },
  });
  return true;
}

// true = a mensagem foi consumida pelo formulário guiado (não deve passar
// pela IA nem pela automação normal de etapa).
export async function processarRespostaGuiada(contact, textoRecebido, instance) {
  if (!contact.formularioEmAndamento) return false;

  const campanha = contact.campanhaId ? await prisma.linkCampanha.findUnique({ where: { id: contact.campanhaId } }) : null;
  const campos = JSON.parse(campanha?.formCampos || "[]");
  if (!campos.length) {
    await prisma.contact.update({ where: { id: contact.id }, data: { formularioEmAndamento: false } });
    return false;
  }

  const indice = contact.formularioProximoIndice;
  const campoAtual = campos[indice];
  if (!campoAtual) {
    await prisma.contact.update({ where: { id: contact.id }, data: { formularioEmAndamento: false } });
    return false;
  }

  // Avança o índice de forma ATÔMICA, condicionado a ele ainda estar onde
  // pensamos. No WhatsApp é comum a pessoa mandar duas mensagens seguidas
  // ("João" / "Silva"): as duas liam o mesmo índice e escreviam o mesmo
  // próximo, então uma resposta era perdida e a mesma pergunta ia de novo.
  // Quem perder a corrida sai daqui sem consumir a mensagem.
  const avancou = await prisma.contact.updateMany({
    where: { id: contact.id, formularioProximoIndice: indice, formularioEmAndamento: true },
    data: { formularioProximoIndice: indice + 1 },
  });
  if (avancou.count === 0) return true; // outra mensagem já respondeu essa pergunta

  // Relê o estado depois do avanço pra não sobrescrever o que a outra
  // mensagem gravou no meio tempo.
  const atualizado = await prisma.contact.findUnique({ where: { id: contact.id } });
  const atuais = JSON.parse(atualizado?.camposCustom || contact.camposCustom || "{}");
  atuais[campoAtual.chave] = (textoRecebido || "").trim();

  const { sendWhatsappText } = await import("@/lib/evolution");
  const proximoIndice = indice + 1;
  const proximoCampo = campos[proximoIndice];

  if (proximoCampo) {
    await prisma.contact.update({
      where: { id: contact.id },
      data: { camposCustom: JSON.stringify(atuais) }, // o índice já foi avançado atomicamente
    });
    const result = await sendWhatsappText(contact.phone, proximoCampo.label, instance).catch(() => ({ ok: false }));
    await prisma.message.create({
      data: { contactId: contact.id, body: proximoCampo.label, kind: "text", fromMe: true, status: result.ok ? "enviado" : "erro", instance },
    });
  } else {
    await prisma.contact.update({
      where: { id: contact.id },
      data: { camposCustom: JSON.stringify(atuais), formularioEmAndamento: false, formularioProximoIndice: 0 },
    });
    const texto = "Perfeito, obrigado pelas informações! Já vamos dar continuidade ao seu atendimento.";
    const result = await sendWhatsappText(contact.phone, texto, instance).catch(() => ({ ok: false }));
    await prisma.message.create({
      data: { contactId: contact.id, body: texto, kind: "text", fromMe: true, status: result.ok ? "enviado" : "erro", instance },
    });
  }
  return true;
}
