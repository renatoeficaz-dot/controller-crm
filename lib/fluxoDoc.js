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
// Última categoria de imagem reconhecida por cliente (fica na memória por 2 min): quando o cliente manda várias
// fotos seguidas, a confirmação "Recebido ✅ (...)" ainda diz o que foi reconhecido.
const ultimasCategorias = new Map();
export function registrarCategoria(contactId, categoria) {
  if (categoria && categoria !== "outro") ultimasCategorias.set(contactId, { categoria, em: Date.now() });
}
function categoriaRecente(contactId) {
  const r = ultimasCategorias.get(contactId);
  return r && Date.now() - r.em < 120000 ? r.categoria : null;
}

const ROTULO_CATEGORIA = {
  comprovante_residencia: "comprovante de residência",
  documento_identidade: "documento de identidade",
  selfie_documento: "selfie com o documento",
  rede_social: "print da rede social",
  fachada: "foto da fachada",
  conversa_parentes: "print da conversa",
  perfil_app: "print do perfil do app",
  historico_corridas: "histórico de corridas",
  documento_veiculo: "documento do veículo",
  selfie_veiculo: "foto com o veículo",
  certidao_vinculo: "documento de vínculo (certidão)",
  cnpj: "CNPJ",
  extrato_recebimento: "extrato de recebimentos",
};
const TEXTO_PROXIMO = (pedido, categoria) => (ROTULO_CATEGORIA[categoria] ? "Recebido ✅ (" + ROTULO_CATEGORIA[categoria] + ")" : "Recebido ✅") + NL + NL + "Agora me envie:" + NL + NL + "✅ " + pedido;
const TEXTO_LEMBRETE = (pedido, categoria) =>
  (ROTULO_CATEGORIA[categoria]
    ? "Recebi o arquivo, mas ele parece ser um " + ROTULO_CATEGORIA[categoria] + " e não o item que preciso agora."
    : "Não consegui identificar o que é esse arquivo (pode estar cortado, escuro ou ilegível). Pode enviar de novo com mais nitidez?") +
  NL + NL + "Preciso de:" + NL + NL + "✅ " + pedido;
const PASSO_VINCULO = {
  chave: "vinculoFamiliar",
  rotulo: "Documento que comprove o vínculo com o titular do comprovante",
  pedido: "Documento que comprove o vínculo com o titular do comprovante (certidão de nascimento, casamento ou outro)",
  categorias: ["certidao_vinculo"],
};
const TEXTO_TIPO = "Para continuar, me conte: você é Motorista de app ou comerciante?";
const TEXTO_TIPO_CLARO = "Entendi! Só para eu te ajudar: você trabalha como motorista de aplicativo (Uber, 99…) ou tem um comércio/negócio próprio?";
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
      cpf: true, cnpj: true, placaVeiculo: true, comercioDescricao: true, semVeiculo: true, endereco: true, enderecoComercial: true, comercioNaResidencia: true, checklistDocumentacao: true,
    },
  });
  if (!c) return null;
  const base = PASSOS_DOC[tipoDosPassos(c.tipoCliente)];
  if (!base) return { contact: c, passos: null, feitos: new Set(), proximo: null };
  // Comprovante em nome de familiar: entra um passo extra logo depois dele (documento de vínculo).
  // Sem veículo (bike/a pé): sai placa/documento/foto do veículo e entra o extrato de onde recebe as corridas.
  const baseTipo = base.filter((p) => (c.semVeiculo ? !p.soComVeiculo : !p.soSemVeiculo));
  const passos = c.comprovanteDeTerceiro
    ? baseTipo.flatMap((p) => (p.chave === "comprovanteResidencia" ? [p, PASSO_VINCULO] : [p]))
    : baseTipo;
  let marcas = {};
  try { marcas = c.checklistDocumentacao ? JSON.parse(c.checklistDocumentacao) : {}; } catch { marcas = {}; }
  const refs = await prisma.contatoReferencia.count({ where: { contactId } });
  const derivado = (chave, passo) => {
    if (chave === "cpf") return !!c.cpf;
    if (chave === "cnpj") return !!c.cnpj;
    if (chave === "placa") return !!c.placaVeiculo;
    if (chave === "nomeTipoComercio") return !!c.comercioDescricao;
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
  const derivadas = ["cpf", "cnpj", "placa", "nomeTipoComercio", "enderecoComercial", "enderecoResidencial"].filter((k) => !marcas[k] && derivado(k));
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
  // Lead já em Análise e chegou contato novo: consulta o dono na Catta (só os ainda não consultados).
  const etapaAtual = await prisma.contact.findUnique({ where: { id: contactId }, select: { stage: { select: { name: true } } } });
  if (etapaAtual?.stage?.name === "Análise") import("@/lib/catta").then((m) => m.consultarDonosDoContato(contactId)).catch(() => {});
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
  historico_corridas: ["historicoCorridas", "extratoRecebimento"],
  documento_veiculo: ["documentoVeiculo"],
  selfie_veiculo: ["selfieVeiculo"],
  certidao_vinculo: ["vinculoFamiliar"],
  extrato_recebimento: ["extratoRecebimento"],
};

const PROMPT_CLASSIFICAR =
  "Esta imagem foi enviada por um cliente que está fazendo um cadastro de empréstimo. Classifique-a em UMA categoria e responda APENAS o nome da categoria, sem mais nada:" + NL +
  "- comprovante_residencia: conta de água, luz, telefone/internet, fatura, boleto OU correspondência (envelope, carta, cartão de banco) onde aparecem um nome e um endereço residencial" + NL +
  "- certidao_vinculo: certidão de nascimento, casamento, união estável ou documento que comprove parentesco entre duas pessoas" + NL +
  "- documento_identidade: RG, CNH ou outro documento de identificação, em foto, print de tela do celular (CNH Digital, RG digital, gov.br) ou página de PDF impressa/escaneada (sem pessoa segurando)" + NL +
  "- selfie_documento: pessoa segurando um documento perto do rosto" + NL +
  "- rede_social: print de perfil/feed de rede social (Instagram, Facebook, TikTok, WhatsApp comercial)" + NL +
  "- fachada: foto da frente de um comércio/loja" + NL +
  "- conversa_parentes: print de conversa de WhatsApp (ou outro app de mensagens), em tema claro OU escuro, mesmo que a conversa tenha fotos, áudios ou comprovantes dentro" + NL +
  "- perfil_app: print do perfil de motorista de aplicativo (Uber, 99, InDrive) com veículo" + NL +
  "- historico_corridas: print com histórico/ganhos de corridas de aplicativo" + NL +
  "- extrato_recebimento: extrato bancário ou do app (Uber, 99, iFood, Rappi, banco digital) mostrando os recebimentos/ganhos de corridas ou entregas" + NL +
  "- documento_veiculo: documento do veículo (CRLV/CRV)" + NL +
  "- selfie_veiculo: foto de um veículo (carro ou moto) com a placa visível, com ou sem pessoa na foto" + NL +
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

const DESCRICAO_CATEGORIA = {
  comprovante_residencia: "uma conta/fatura (água, luz, internet, telefone, gás) ou correspondência com nome e endereço",
  rede_social: "um print de perfil ou feed de rede social (Instagram, Facebook, TikTok, WhatsApp comercial)",
  fachada: "uma foto da frente (fachada) de um estabelecimento, loja, portão, muro ou porta, OU do local de trabalho (cozinha, ateliê, estoque, produtos, pessoa produzindo), mesmo sem nome ou placa",
  conversa_parentes: "um print de uma conversa de WhatsApp (ou outro app de mensagens) entre duas pessoas, em tema claro OU escuro",
  perfil_app: "um print do perfil de motorista de aplicativo (Uber, 99, InDrive) com dados do veículo",
  historico_corridas: "um print de histórico/ganhos de corridas de aplicativo",
  extrato_recebimento: "um extrato bancário ou de app mostrando recebimentos/ganhos de corridas ou entregas",
  documento_veiculo: "o documento de um veículo (CRLV/CRV)",
  selfie_documento: "uma pessoa segurando um documento perto do rosto",
  selfie_veiculo: "uma foto de um veículo (carro ou moto) com a placa visível, com ou sem pessoa",
  certidao_vinculo: "uma certidão (nascimento, casamento) ou documento de parentesco",
};

// Segunda chance: escolha forçada entre as categorias do item pedido e "outro" (prompt curto funciona melhor
// que a pergunta sim/não — o modelo respondia "não" para print de conversa em tema escuro).
async function classificarRestrito(base64, mimetype, apiKey, cats) {
  try {
    const opcoes = cats.map((c) => "- " + c + ": " + DESCRICAO_CATEGORIA[c]).join(NL) + NL + "- outro: nenhuma das anteriores";
    const res = await fetch("https://api.deepinfra.com/v1/openai/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
      body: JSON.stringify({
        model: "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8",
        temperature: 0,
        max_tokens: 20,
        messages: [{ role: "user", content: [
          { type: "text", text: "Classifique esta imagem em UMA destas categorias e responda apenas o nome:" + NL + opcoes },
          { type: "image_url", image_url: { url: "data:" + mimetype + ";base64," + base64 } },
        ] }],
      }),
    });
    const data = await res.json().catch(() => null);
    const txt = String(data?.choices?.[0]?.message?.content || "").toLowerCase();
    return cats.find((c) => txt.includes(c)) || null;
  } catch {
    return null;
  }
}

async function confirmarCategoria(base64, mimetype, apiKey, descricao) {
  if (!descricao) return false;
  try {
    const res = await fetch("https://api.deepinfra.com/v1/openai/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
      body: JSON.stringify({
        model: "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8",
        temperature: 0,
        max_tokens: 5,
        messages: [{ role: "user", content: [
          { type: "text", text: "Esta imagem é " + descricao + "? Responda apenas sim ou nao." },
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

export const PLACA_RE = /^[A-Z]{3}\d[A-Z0-9]\d{2}$/;

export async function detectarPlacaPorImagem(base64, mimetype, apiKey) {
  if (!apiKey || !base64) return null;
  try {
    const res = await fetch("https://api.deepinfra.com/v1/openai/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
      body: JSON.stringify({
        model: "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8",
        temperature: 0,
        max_tokens: 20,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: "Esta imagem mostra a PLACA de um veículo brasileiro (7 caracteres: 3 letras + 1 número + 1 letra ou número + 2 números, ex.: ABC1D23 ou ABC1234), numa placa física ou no documento do veículo (CRLV)? Se sim, responda APENAS os 7 caracteres, sem hífen nem espaço. Se não houver placa legível, responda exatamente \"nenhuma\". Não escreva mais nada." },
            { type: "image_url", image_url: { url: "data:" + mimetype + ";base64," + base64 } },
          ],
        }],
      }),
    });
    const data = await res.json().catch(() => null);
    const placa = String(data?.choices?.[0]?.message?.content || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    return PLACA_RE.test(placa) ? placa : null;
  } catch {
    return null;
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
// "Zoom" para leitura: amplia e afia a imagem inteira (sem recortes: recortar já fez o modelo inventar rua diferente)
// porque comprovantes em print de celular têm letra miúda e o modelo não consegue ler no tamanho original.
async function variantesAmpliadas(base64) {
  try {
    const sharp = (await import("sharp")).default;
    const buf = Buffer.from(base64, "base64");
    const meta = await sharp(buf).metadata();
    const w = meta.width || 800;
    const alvo = Math.min(2600, Math.max(1800, w * 2.5));
    const out = [];
    const ampliar = async (extract) => {
      let img = sharp(buf).rotate();
      if (extract) img = img.extract(extract);
      const r = await img.resize({ width: Math.round(alvo), kernel: "lanczos3" }).normalize().sharpen().jpeg({ quality: 92 }).toBuffer();
      return r.toString("base64");
    };
    out.push(await ampliar(null));
    return out;
  } catch (err) {
    console.error("[fluxoDoc] zoom:", err.message);
    return [];
  }
}

export async function lerDocumento(contact, saved, apiKey) {
  const vazio = { marcas: [], dados: {}, genero: null, categoria: null, cnpjInvalido: null };
  const ehImagem = saved.kind === "image" || (saved.kind === "document" && (saved.mimeType || "").startsWith("image/"));
  const ehPdf = saved.kind === "document" && saved.mimeType === "application/pdf";
  if (!(ehImagem || ehPdf) || !saved.mediaUrl) return vazio;
  const { readMediaAsBase64 } = await import("@/lib/mediaStorage");
  let base64 = await readMediaAsBase64(saved.mediaUrl);
  let mimetype = saved.mimeType;
  // PDF com senha (ex.: fatura protegida): não dá para ler — a confirmação ao cliente pede o arquivo sem senha.
  if (base64 && ehPdf && Buffer.from(base64, "base64").subarray(0, 200000).toString("latin1").includes("/Encrypt")) {
    return { ...vazio, categoria: "pdf_protegido" };
  }
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
  // Mesma ideia para os outros itens de imagem: se a leitura geral não bateu com o item que estamos pedindo,
  // confere só essa pergunta (ex.: print de conversa em tema escuro caía em "outro").
  if (contact.docPedido && contact.docPedido !== "fotoDocumento" && !(MARCAS_POR_CATEGORIA[categoria] || []).some((m) => m === contact.docPedido) && categoria !== "documento_identidade" && categoria !== "selfie_documento") {
    const passo = [...PASSOS_DOC.uber, ...PASSOS_DOC.comerciante].find((p) => p.chave === contact.docPedido && p.categorias?.length);
    const cats = (passo?.categorias || []).filter((c) => DESCRICAO_CATEGORIA[c]);
    if (cats.length) {
      const escolhida = await classificarRestrito(base64, mimetype, apiKey, cats);
      if (escolhida) categoria = escolhida;
    }
  }
  const marcas = [...(MARCAS_POR_CATEGORIA[categoria] || [])];
  // Pedimos o documento de vínculo e veio RG/CNH (a filiação mostra o nome do titular): vale, e a equipe confere na análise.
  const vinculoPorRg = contact.docPedido === "vinculoFamiliar" && categoria === "documento_identidade";
  if (vinculoPorRg) marcas.push("vinculoFamiliar");
  const ehIdentidade = categoria === "documento_identidade" || categoria === "selfie_documento";
  const ehComprovante = categoria === "comprovante_residencia";
  const procuraCnpj = !contact.cnpj && (categoria === "cnpj" || categoria === "outro" || categoria === "fachada");

  const procuraPlaca = !contact.placaVeiculo && ["selfie_veiculo", "documento_veiculo", "perfil_app"].includes(categoria);
  const [analise, cpf, endereco, genero, cnpjLido, placaLida] = await Promise.all([
    ehIdentidade || ehComprovante ? analyzeDocumentImage(base64, mimetype, saved.body, apiKey).catch(() => null) : null,
    ehIdentidade && !contact.cpf ? detectarCpfPorDocumento(base64, mimetype, apiKey).catch(() => null) : null,
    ehComprovante && !contact.endereco ? detectarEnderecoPorDocumento(base64, mimetype, apiKey).catch(() => null) : null,
    ehIdentidade ? detectarGeneroPorDocumento(base64, mimetype, apiKey).catch(() => null) : null,
    procuraCnpj ? detectarCnpjPorImagem(base64, mimetype, apiKey) : null,
    procuraPlaca ? detectarPlacaPorImagem(base64, mimetype, apiKey) : null,
  ]);
  let placaFinal = placaLida;
  if (procuraPlaca && !placaFinal) {
    for (const v of await variantesAmpliadas(base64)) {
      placaFinal = await detectarPlacaPorImagem(v, "image/jpeg", apiKey);
      if (placaFinal) break;
    }
  }

  // Não leu o endereço/CPF no tamanho original: tenta de novo com zoom (imagem ampliada e recortes).
  let enderecoFinal = endereco;
  let cpfFinal = cpf;
  if ((ehComprovante && !contact.endereco && !enderecoFinal) || (ehIdentidade && !contact.cpf && !cpfFinal)) {
    for (const v of await variantesAmpliadas(base64)) {
      if (ehComprovante && !contact.endereco && !enderecoFinal) enderecoFinal = await detectarEnderecoPorDocumento(v, "image/jpeg", apiKey).catch(() => null);
      if (ehIdentidade && !contact.cpf && !cpfFinal) cpfFinal = await detectarCpfPorDocumento(v, "image/jpeg", apiKey).catch(() => null);
      if ((!ehComprovante || contact.endereco || enderecoFinal) && (!ehIdentidade || contact.cpf || cpfFinal)) break;
    }
  }

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
    vinculoPorRg,
    genero,
    cnpjInvalido,
    dados: {
      cpf: cpfFinal,
      endereco_residencial: enderecoFinal,
      cnpj,
      placa: placaFinal,
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
export async function perguntarProximo({ contactId, instance, savedAt, mudou, ehMidia, retomar, jaEnviou, texto, categoria, novasRefs, preparar }) {
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
      const ultimoTipo = await prisma.message.findFirst({ where: { contactId, fromMe: true, body: TEXTO_TIPO }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
      const recente = ultimoTipo && ultimoTipo.createdAt > new Date(Date.now() - 60 * 60e3);
      if (!recente) {
        await enviarTextoIa(cl, instance, TEXTO_TIPO);
      } else if (ultimoTipo.createdAt < savedAt) {
        // O cliente respondeu à pergunta do tipo com algo que não deu para entender: explica de outro jeito (máx. 2x em 24h)
        // em vez de ficar calado.
        const nClar = await prisma.message.count({ where: { contactId, fromMe: true, body: TEXTO_TIPO_CLARO, createdAt: { gte: new Date(Date.now() - 24 * 3600e3) } } });
        if (nClar < 2) await enviarTextoIa(cl, instance, TEXTO_TIPO_CLARO);
      }
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
      const texto = c.docPedido ? TEXTO_PROXIMO(e.proximo.pedido, categoriaRecente(contactId) || (mudou ? categoria : null)) : TEXTO_PRIMEIRO(e.proximo.pedido);
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
        const texto = "" + "Recebi " + n + " contato" + (n > 1 ? "s" : "") + ". Ainda " + (falta > 1 ? "faltam " + falta : "falta 1") + (c.tipoCliente === "comerciante" ? " (um deles deve ser o contato do comércio)" : "") + ". Pode me enviar?";
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
      const ultimaNossa = await prisma.message.findFirst({ where: { contactId, fromMe: true }, orderBy: { createdAt: "desc" }, select: { body: true } });
      const ehPedidoPendente = c.docPedido === e.proximo.chave;
      // "Ok"/"blz" depois de a gente pedir o item: responde com um empurrão gentil (no máximo 1x a cada 3 h) em vez de ficar calada.
      if (soAgradece && /^(Para continuar, me envie|Agora me envie|Recebido ✅)/.test(String(ultimaNossa?.body || "")) && ehPedidoPendente) {
        const empurrao = "Combinado! Assim que puder, me envie:" + NL + NL + "✅ " + e.proximo.pedido;
        const jaEmpurrou = await prisma.message.count({ where: { contactId, fromMe: true, body: empurrao, createdAt: { gte: new Date(Date.now() - 3 * 3600e3) } } });
        if (!jaEmpurrou) await enviarTextoIa(c, instance, empurrao);
        return;
      }
      if (!soAgradece) {
        const lembrete = "Para continuar, me envie:" + NL + NL + "✅ " + e.proximo.pedido;
        const recente = await prisma.message.count({ where: { contactId, fromMe: true, body: lembrete, createdAt: { gte: new Date(Date.now() - 10 * 60e3) } } });
        // Já pedimos o mesmo item 3x nas últimas 6h e o cliente segue respondendo outra coisa: para de insistir e chama a equipe.
        const repetidos = await prisma.message.count({ where: { contactId, fromMe: true, body: lembrete, createdAt: { gte: new Date(Date.now() - 6 * 3600e3) } } });
        if (!recente && repetidos >= 3) {
          const aviso = "Entendi! Vou pedir para a nossa equipe analisar o seu caso e já retornamos com uma resposta.";
          const jaAvisou = await prisma.message.count({ where: { contactId, fromMe: true, body: aviso, createdAt: { gte: new Date(Date.now() - 6 * 3600e3) } } });
          if (!jaAvisou) await enviarTextoIa(c, instance, aviso);
          const tit = "Cliente não consegue seguir o pedido — verificar";
          if (!(await prisma.task.count({ where: { contactId, title: tit, done: false } }))) {
            await prisma.task.create({ data: { contactId, title: tit, notes: "Pedido repetido 3x: " + e.proximo.pedido + " | última resposta: " + t.slice(0, 200), dueDate: new Date(), responsavel: c.responsavel || null } }).catch(() => {});
          }
          return;
        }
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
      const texto = categoria === "pdf_protegido"
        ? "Esse arquivo está protegido por senha e eu não consigo abrir. Pode enviar o PDF sem senha, ou uma foto/print do documento?" + NL + NL + "✅ " + e.proximo.pedido
        : categoria === "comprovante_residencia" && e.proximo.tipo === "dado"
        ? "Recebi o comprovante, mas não consegui ler o endereço nele. Pode digitar o endereço completo com CEP?" + NL + NL + "✅ " + e.proximo.pedido
        : TEXTO_LEMBRETE(e.proximo.pedido, categoria);
      const recente = await prisma.message.count({ where: { contactId, fromMe: true, body: texto, createdAt: { gte: new Date(Date.now() - 3 * 60e3) } } });
      if (!recente) await enviarTextoIa(c, instance, texto);
    }
  });
}
