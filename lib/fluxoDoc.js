import { prisma } from "@/lib/prisma";
import { PASSOS_DOC } from "@/lib/checklistDoc";
import { avisarAnaliseForaDoHorario } from "@/lib/fluxoDuvida";
import {
  moveContactStage,
  analyzeDocumentImage,
  detectarCpfPorDocumento,
  detectarEnderecoPorDocumento,
  detectarGeneroPorDocumento,
} from "@/lib/ia";

// Atendimento por documentação: a IA pede UM documento por vez (lib/checklistDoc.js),
// marca o checklist da ficha conforme o cliente envia, e quando completa avisa o cliente
// e manda o lead para "Análise" (dali em diante é atendimento humano).

const NL = String.fromCharCode(10);
const ETAPAS_PEDIDO = ["Em conversa", "Documentação"];

const TEXTO_PRIMEIRO = (pedido) => "Certo! Vamos começar o seu cadastro. Me envie por favor:" + NL + NL + "✅ " + pedido;
const TEXTO_PROXIMO = (pedido) => "Recebido ✅" + NL + NL + "Agora me envie:" + NL + NL + "✅ " + pedido;
const TEXTO_LEMBRETE = (pedido) => "Não consegui identificar esse arquivo. Preciso de:" + NL + NL + "✅ " + pedido;
const PASSO_VINCULO = {
  chave: "vinculoFamiliar",
  rotulo: "Documento que comprove o vínculo com o titular do comprovante",
  pedido: "Documento que comprove o vínculo com o titular do comprovante (certidão de nascimento, casamento ou outro)",
  categorias: ["certidao_vinculo"],
};
const TEXTO_TIPO = "Para continuar, me conte: você é Motorista de app ou comerciante?";
export const TEXTO_FINAL = "Certo, vamos analisar sua documentação.";

/* ------------------------------------------------------------------ */
/* Fila por lead: mensagens do mesmo cliente são tratadas uma de cada vez */
/* ------------------------------------------------------------------ */
const filas = new Map();
export function serial(id, fn) {
  const anterior = filas.get(id) || Promise.resolve();
  const proxima = anterior.catch(() => {}).then(fn);
  filas.set(id, proxima);
  proxima.finally(() => { if (filas.get(id) === proxima) filas.delete(id); }).catch(() => {});
  return proxima;
}

/* ------------------------------------------------------------------ */
/* Checklist                                                          */
/* ------------------------------------------------------------------ */
export async function marcarChecklistDoc(contactId, chaves) {
  if (!chaves?.length) return;
  const c = await prisma.contact.findUnique({ where: { id: contactId }, select: { checklistDocumentacao: true } });
  let atual = {};
  try { atual = c?.checklistDocumentacao ? JSON.parse(c.checklistDocumentacao) : {}; } catch { atual = {}; }
  let mudou = false;
  for (const k of chaves) if (!atual[k]) { atual[k] = true; mudou = true; }
  if (mudou) await prisma.contact.update({ where: { id: contactId }, data: { checklistDocumentacao: JSON.stringify(atual) } });
}

export const tipoDosPassos = (tipoCliente) => (tipoCliente === "motoboy" ? "uber" : tipoCliente);

export async function estadoDocumentacao(contactId) {
  const c = await prisma.contact.findUnique({
    where: { id: contactId },
    select: {
      id: true, name: true, phone: true, stageId: true, iaPausada: true, tipoCliente: true, docPedido: true, comprovanteDeTerceiro: true,
      cpf: true, cnpj: true, endereco: true, enderecoComercial: true, comercioNaResidencia: true, checklistDocumentacao: true,
    },
  });
  if (!c) return null;
  const base = PASSOS_DOC[tipoDosPassos(c.tipoCliente)];
  if (!base) return { contact: c, passos: null, feitos: new Set(), proximo: null };
  // Comprovante em nome de familiar: entra um passo extra logo depois dele (documento de vínculo).
  const passos = c.comprovanteDeTerceiro
    ? base.flatMap((p) => (p.chave === "comprovanteResidencia" ? [p, PASSO_VINCULO] : [p]))
    : base;
  let marcas = {};
  try { marcas = c.checklistDocumentacao ? JSON.parse(c.checklistDocumentacao) : {}; } catch { marcas = {}; }
  const refs = await prisma.contatoReferencia.count({ where: { contactId } });
  const derivado = (chave, passo) => {
    if (chave === "cpf") return !!c.cpf;
    if (chave === "cnpj") return !!c.cnpj;
    if (chave === "enderecoComercial") return !!c.enderecoComercial;
    if (chave === "enderecoResidencial") return !!c.endereco || (c.comercioNaResidencia && !!c.enderecoComercial);
    if (chave === "referencias") return refs >= (passo?.minimo || 3);
    return false;
  };
  const feito = (p) => {
    if (p.compostoDe) return p.compostoDe.every((k) => marcas[k] || derivado(k));
    return !!marcas[p.chave] || derivado(p.chave, p);
  };
  // O que já está preenchido na ficha também conta como feito — e passa a aparecer marcado no checklist.
  const derivadas = ["cpf", "cnpj", "enderecoComercial", "enderecoResidencial"].filter((k) => !marcas[k] && derivado(k));
  const refPasso = passos.find((p) => p.chave === "referencias");
  if (refPasso && !marcas.referencias && derivado("referencias", refPasso)) derivadas.push("referencias");
  if (derivadas.length) {
    await marcarChecklistDoc(contactId, derivadas).catch(() => {});
    for (const k of derivadas) marcas[k] = true;
  }
  const feitos = new Set(passos.filter(feito).map((p) => p.chave));
  const proximo = passos.find((p) => !feitos.has(p.chave)) || null;
  return { contact: c, passos, feitos, proximo, marcas };
}

// Espelha os contatos de referência nos campos Parente / Contato 2 / Contato 3 de "Dados pra
// conferência" (só nos que estão vazios, sem repetir telefone e sem sobrescrever o que a equipe digitou).
export async function espelharReferencias(contactId) {
  const c = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { nomeParente: true, telefoneParente: true, nomeContato: true, telefoneContato: true, nomeContato3: true, telefoneContato3: true },
  });
  if (!c) return;
  const slots = [["nomeParente", "telefoneParente"], ["nomeContato", "telefoneContato"], ["nomeContato3", "telefoneContato3"]];
  const refs = await prisma.contatoReferencia.findMany({ where: { contactId }, orderBy: { id: "asc" }, select: { nome: true, telefone: true } });
  const cauda = (t) => String(t || "").replace(/\D/g, "").slice(-8);
  const usados = new Set(slots.map(([, t]) => cauda(c[t])).filter(Boolean));
  const data = {};
  for (const r of refs) {
    if (usados.has(cauda(r.telefone))) continue;
    const livre = slots.find(([n, t]) => !c[t] && !data[t]);
    if (!livre) break;
    data[livre[0]] = r.nome;
    data[livre[1]] = r.telefone;
    usados.add(cauda(r.telefone));
  }
  if (Object.keys(data).length) await prisma.contact.update({ where: { id: contactId }, data });
}

// Marca "contatos de referência" quando o número exigido pelo tipo de cliente foi atingido.
export async function atualizarMarcaReferencias(contactId) {
  await espelharReferencias(contactId).catch(() => {});
  const c = await prisma.contact.findUnique({ where: { id: contactId }, select: { tipoCliente: true } });
  const passo = (PASSOS_DOC[tipoDosPassos(c?.tipoCliente)] || []).find((p) => p.chave === "referencias");
  const minimo = passo?.minimo || 3;
  const n = await prisma.contatoReferencia.count({ where: { contactId } });
  if (n >= minimo) await marcarChecklistDoc(contactId, ["referencias"]);
}

/* ------------------------------------------------------------------ */
/* Leitura de imagem                                                  */
/* ------------------------------------------------------------------ */
const MARCAS_POR_CATEGORIA = {
  comprovante_residencia: ["comprovanteResidencia"],
  documento_identidade: ["fotoDocumento"],
  selfie_documento: ["selfieDocumento"],
  rede_social: ["redeSocial"],
  fachada: ["redeSocial"],
  conversa_parentes: ["conversaParentes"],
  perfil_app: ["perfilApp"],
  historico_corridas: ["historicoCorridas"],
  documento_veiculo: ["documentoVeiculo"],
  selfie_veiculo: ["selfieVeiculo"],
  certidao_vinculo: ["vinculoFamiliar"],
};

const PROMPT_CLASSIFICAR =
  "Esta imagem foi enviada por um cliente que está fazendo um cadastro de empréstimo. Classifique-a em UMA categoria e responda APENAS o nome da categoria, sem mais nada:" + NL +
  "- comprovante_residencia: conta de água, luz, telefone/internet, fatura, boleto OU correspondência (envelope, carta, cartão de banco) onde aparecem um nome e um endereço residencial" + NL +
  "- certidao_vinculo: certidão de nascimento, casamento, união estável ou documento que comprove parentesco entre duas pessoas" + NL +
  "- documento_identidade: RG, CNH ou outro documento de identificação, em foto, print de tela do celular (CNH Digital, RG digital, gov.br) ou página de PDF impressa/escaneada (sem pessoa segurando)" + NL +
  "- selfie_documento: pessoa segurando um documento perto do rosto" + NL +
  "- rede_social: print de perfil/feed de rede social (Instagram, Facebook, TikTok, WhatsApp comercial)" + NL +
  "- fachada: foto da frente de um comércio/loja" + NL +
  "- conversa_parentes: print de conversa de WhatsApp com familiares/parentes" + NL +
  "- perfil_app: print do perfil de motorista de aplicativo (Uber, 99, InDrive) com veículo" + NL +
  "- historico_corridas: print com histórico/ganhos de corridas de aplicativo" + NL +
  "- documento_veiculo: documento do veículo (CRLV/CRV)" + NL +
  "- selfie_veiculo: pessoa junto de um veículo mostrando a placa" + NL +
  "- cnpj: cartão CNPJ ou papel/nota com número de CNPJ" + NL +
  "- outro: qualquer outra coisa ou imagem ilegível";

export async function classificarImagem(base64, mimetype, apiKey) {
  if (!apiKey || !base64) return null;
  try {
    const res = await fetch("https://api.deepinfra.com/v1/openai/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
      body: JSON.stringify({
        model: "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8",
        temperature: 0,
        max_tokens: 20,
        messages: [{ role: "user", content: [{ type: "text", text: PROMPT_CLASSIFICAR }, { type: "image_url", image_url: { url: "data:" + mimetype + ";base64," + base64 } }] }],
      }),
    });
    const data = await res.json().catch(() => null);
    const txt = String(data?.choices?.[0]?.message?.content || "").toLowerCase();
    return Object.keys(MARCAS_POR_CATEGORIA).concat(["cnpj", "outro"]).find((k) => txt.includes(k)) || "outro";
  } catch {
    return null;
  }
}

async function pareceDocumentoIdentidade(base64, mimetype, apiKey) {
  try {
    const res = await fetch("https://api.deepinfra.com/v1/openai/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
      body: JSON.stringify({
        model: "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8",
        temperature: 0,
        max_tokens: 5,
        messages: [{ role: "user", content: [
          { type: "text", text: "Esta imagem é um documento de identificação pessoal brasileiro (CNH, RG, carteira de identidade ou documento de habilitação) — pode ser foto do papel, print de tela do celular, CNH Digital ou página de PDF impressa/escaneada? Responda apenas sim ou nao." },
          { type: "image_url", image_url: { url: "data:" + mimetype + ";base64," + base64 } },
        ] }],
      }),
    });
    const data = await res.json().catch(() => null);
    return /^\s*sim/i.test(String(data?.choices?.[0]?.message?.content || ""));
  } catch {
    return false;
  }
}

export function cnpjValido(c) {
  if (!/^\d{14}$/.test(c) || /^(\d)\1+$/.test(c)) return false;
  const dv = (base) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = [...base].reduce((s, d, i) => s + Number(d) * pesos[i], 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(c.slice(0, 12)) === Number(c[12]) && dv(c.slice(0, 13)) === Number(c[13]);
}

export async function detectarCnpjPorImagem(base64, mimetype, apiKey) {
  if (!apiKey || !base64) return null;
  try {
    const res = await fetch("https://api.deepinfra.com/v1/openai/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
      body: JSON.stringify({
        model: "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8",
        temperature: 0,
        max_tokens: 40,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: "Esta imagem mostra um número de CNPJ (14 dígitos, formato 00.000.000/0000-00), impresso OU escrito à mão (ex.: papel, cartão CNPJ, nota fiscal, placa)? Se sim, responda APENAS os 14 dígitos, sem pontos, barra nem traço. Se não houver CNPJ legível, responda exatamente \"nenhum\". Não escreva mais nada." },
            { type: "image_url", image_url: { url: "data:" + mimetype + ";base64," + base64 } },
          ],
        }],
      }),
    });
    const data = await res.json().catch(() => null);
    const digitos = String(data?.choices?.[0]?.message?.content || "").replace(/\D/g, "");
    return digitos.length === 14 ? digitos : null;
  } catch {
    return null;
  }
}

// Lê UMA imagem/PDF recebido: classifica o tipo de documento (marca o passo do checklist) e,
// conforme o tipo, extrai CPF / endereço / nome / gênero / CNPJ. Devolve o que achou; quem
// chama grava na ficha.
export async function lerDocumento(contact, saved, apiKey) {
  const vazio = { marcas: [], dados: {}, genero: null, categoria: null, cnpjInvalido: null };
  const ehImagem = saved.kind === "image" || (saved.kind === "document" && (saved.mimeType || "").startsWith("image/"));
  const ehPdf = saved.kind === "document" && saved.mimeType === "application/pdf";
  if (!(ehImagem || ehPdf) || !saved.mediaUrl) return vazio;
  const { readMediaAsBase64 } = await import("@/lib/mediaStorage");
  let base64 = await readMediaAsBase64(saved.mediaUrl);
  let mimetype = saved.mimeType;
  if (base64 && ehPdf) {
    const { pdfPrimeiraPaginaComoImagem } = await import("@/lib/pdfPreview");
    const conv = await pdfPrimeiraPaginaComoImagem(base64).catch(() => null);
    if (!conv) return vazio;
    base64 = conv.base64;
    mimetype = conv.mimetype;
  }
  if (!base64) return vazio;

  let categoria = await classificarImagem(base64, mimetype, apiKey);
  // Estamos esperando o documento de identidade e a classificação geral não achou: confere de novo
  // só esta pergunta (CNH digital em print de tela, PDF impresso etc. costumam cair em "outro").
  if (contact.docPedido === "fotoDocumento" && (categoria === "outro" || categoria === "documento_veiculo" || categoria === null)) {
    if (await pareceDocumentoIdentidade(base64, mimetype, apiKey)) categoria = "documento_identidade";
  }
  const marcas = [...(MARCAS_POR_CATEGORIA[categoria] || [])];
  const ehIdentidade = categoria === "documento_identidade" || categoria === "selfie_documento";
  const ehComprovante = categoria === "comprovante_residencia";
  const procuraCnpj = !contact.cnpj && (categoria === "cnpj" || categoria === "outro" || categoria === "fachada");

  const [analise, cpf, endereco, genero, cnpjLido] = await Promise.all([
    ehIdentidade || ehComprovante ? analyzeDocumentImage(base64, mimetype, saved.body, apiKey).catch(() => null) : null,
    ehIdentidade && !contact.cpf ? detectarCpfPorDocumento(base64, mimetype, apiKey).catch(() => null) : null,
    ehComprovante && !contact.endereco ? detectarEnderecoPorDocumento(base64, mimetype, apiKey).catch(() => null) : null,
    ehIdentidade ? detectarGeneroPorDocumento(base64, mimetype, apiKey).catch(() => null) : null,
    procuraCnpj ? detectarCnpjPorImagem(base64, mimetype, apiKey) : null,
  ]);

  let cnpj = null;
  let cnpjInvalido = null;
  if (cnpjLido) {
    if (cnpjValido(cnpjLido)) cnpj = cnpjLido;
    else cnpjInvalido = cnpjLido;
  }
  const nome = analise?.match(/NOME_DETECTADO:\s*(.+)/i)?.[1]?.trim();
  return {
    marcas,
    categoria,
    genero,
    cnpjInvalido,
    dados: {
      cpf,
      endereco_residencial: endereco,
      cnpj,
      nome: nome && nome.toLowerCase() !== "nenhum" ? nome : null,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Pedido do próximo documento                                        */
/* ------------------------------------------------------------------ */
async function enviarTextoIa(contact, instance, body) {
  const { sendWhatsappText } = await import("@/lib/evolution");
  const r = await sendWhatsappText(contact.phone, body, instance).catch(() => ({ ok: false }));
  await prisma.message.create({
    data: { contactId: contact.id, enviadoPor: "IA", body, kind: "text", fromMe: true, status: r.simulated ? "simulado" : r.ok ? "enviado" : "erro", instance },
  });
  return r.ok !== false;
}

// Chamado depois de processar uma mensagem do cliente. Espera alguns segundos para juntar uma
// rajada de envios (cliente manda 6 fotos seguidas → só a última mensagem pede o próximo item).
export async function perguntarProximo({ contactId, instance, savedAt, mudou, ehMidia, retomar, jaEnviou, texto, preparar }) {
  await new Promise((r) => setTimeout(r, 7000));
  return serial(contactId, async () => {
    const cfg = await prisma.config.findUnique({ where: { id: "singleton" }, select: { iaGlobalPausada: true } });
    if (cfg?.iaGlobalPausada) return;
    // Antes de pedir qualquer coisa, lê o que o cliente já tinha enviado antes (uma vez só).
    if (preparar) await preparar().catch((err) => console.error("[fluxoDoc] histórico:", err.message));
    const e = await estadoDocumentacao(contactId);
    if (e && !e.passos) {
      // Ainda não disse o que é: em "Em conversa", repete a pergunta do tipo (no máximo 1x por hora).
      const cl = e.contact;
      if (cl.iaPausada) return;
      const et = await prisma.stage.findUnique({ where: { id: cl.stageId } });
      if (et?.name !== "Em conversa") return;
      if (await prisma.message.count({ where: { contactId, fromMe: false, createdAt: { gt: savedAt } } })) return;
      const recente = await prisma.message.count({ where: { contactId, fromMe: true, body: TEXTO_TIPO, createdAt: { gte: new Date(Date.now() - 60 * 60e3) } } });
      if (!recente) await enviarTextoIa(cl, instance, TEXTO_TIPO);
      return;
    }
    if (!e || !e.passos) return;
    const c = e.contact;
    if (c.iaPausada || c.docPedido === "legado" || c.docPedido === "concluido") return;
    const etapa = await prisma.stage.findUnique({ where: { id: c.stageId } });
    if (!etapa || !ETAPAS_PEDIDO.includes(etapa.name)) return;
    // Chegou mensagem mais nova do cliente: ela mesma vai decidir o que pedir.
    const nova = await prisma.message.count({ where: { contactId, fromMe: false, createdAt: { gt: savedAt } } });
    if (nova > 0) return;

    if (!e.proximo) {
      await enviarTextoIa(c, instance, TEXTO_FINAL);
      await prisma.contact.update({ where: { id: contactId }, data: { docPedido: "concluido" } });
      await moveContactStage(contactId, "Análise", instance).catch(() => {});
      await avisarAnaliseForaDoHorario(c, instance).catch(() => {});
      return;
    }

    if (c.docPedido !== e.proximo.chave) {
      const texto = c.docPedido ? TEXTO_PROXIMO(e.proximo.pedido) : TEXTO_PRIMEIRO(e.proximo.pedido);
      await enviarTextoIa(c, instance, texto);
      await prisma.contact.update({ where: { id: contactId }, data: { docPedido: e.proximo.chave } });
      return;
    }

    // "Já enviei": explica que o que veio antes foi recebido, mas este item ainda não foi identificado.
    if (jaEnviou && !mudou && !ehMidia && e.proximo.chave !== "referencias") {
      const texto = "O que você enviou já foi recebido ✅, mas ainda não consegui identificar este item:" + NL + NL + "✅ " + e.proximo.pedido;
      const recente = await prisma.message.count({ where: { contactId, fromMe: true, body: texto, createdAt: { gte: new Date(Date.now() - 10 * 60e3) } } });
      if (!recente) await enviarTextoIa(c, instance, texto);
      return;
    }

    // Acabou de responder uma dúvida do cliente: volta a pedir o item pendente.
    if (retomar && !mudou && !ehMidia) {
      const texto = "Para continuar, me envie:" + NL + NL + "✅ " + e.proximo.pedido;
      await enviarTextoIa(c, instance, texto);
      return;
    }

    // Contatos de referência: cliente mandou alguns mas ainda faltam → diz quantos faltam.
    if (e.proximo.chave === "referencias" && !ehMidia) {
      const minimo = e.proximo.minimo || 3;
      const n = await prisma.contatoReferencia.count({ where: { contactId } });
      if (n > 0 && n < minimo) {
        const falta = minimo - n;
        const texto = (!mudou ? "Esse contato já tinha sido enviado. " : "") + "Recebi " + n + " contato" + (n > 1 ? "s" : "") + ". Ainda " + (falta > 1 ? "faltam " + falta : "falta 1") + (c.tipoCliente === "comerciante" ? " (um deles deve ser o contato do comércio)" : "") + ". Pode me enviar?";
        const recente = await prisma.message.count({ where: { contactId, fromMe: true, body: texto, createdAt: { gte: new Date(Date.now() - 10 * 60e3) } } });
        if (!recente) await enviarTextoIa(c, instance, texto);
        return;
      }
    }

    // Resposta que não adiantou nada (não preencheu, não era arquivo, não foi dúvida): volta a pedir o item
    // pendente, para a IA nunca "parar" no meio. Agradecimentos/ok são ignorados.
    if (!ehMidia && !mudou && !retomar && !jaEnviou && c.docPedido === e.proximo.chave && String(texto || "").trim()) {
      const t = String(texto).trim();
      const soAgradece = /^(ok|okay|blz|beleza|certo|combinado|t[aá]|t[aá] bom|show|valeu|obrigad[oa]|muito obrigad[oa]|brigad[oa]|obg|👍|🙏|[\s.!,]+)+$/i.test(t);
      if (!soAgradece) {
        const lembrete = "Para continuar, me envie:" + NL + NL + "✅ " + e.proximo.pedido;
        const recente = await prisma.message.count({ where: { contactId, fromMe: true, body: lembrete, createdAt: { gte: new Date(Date.now() - 10 * 60e3) } } });
        if (!recente) {
          await enviarTextoIa(c, instance, lembrete);
          const titulo = "Cliente respondeu fora do fluxo — verificar";
          const aberta = await prisma.task.count({ where: { contactId, title: titulo, done: false } });
          if (!aberta) await prisma.task.create({ data: { contactId, title: titulo, notes: t.slice(0, 300), dueDate: new Date(), responsavel: c.responsavel || null } }).catch(() => {});
        }
        return;
      }
    }

    // Mesmo item já pedido: se o cliente mandou arquivo que não serviu, avisa (sem repetir em 3 min).
    if (ehMidia && !mudou) {
      const texto = TEXTO_LEMBRETE(e.proximo.pedido);
      const recente = await prisma.message.count({ where: { contactId, fromMe: true, body: texto, createdAt: { gte: new Date(Date.now() - 3 * 60e3) } } });
      if (!recente) await enviarTextoIa(c, instance, texto);
    }
  });
}
