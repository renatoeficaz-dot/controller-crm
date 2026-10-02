import { prisma } from "@/lib/prisma";
import { validarCPF } from "@/lib/cpf";
import {
  MODELO_TEXTO,
  getIaConfig,
  moveContactStage,
  sendTemplateByTitle,
  autoMoverVendaPerdida,
  transcribeAudio,
  analyzeDocumentImage,
  detectarCpfPorDocumento,
  detectarEnderecoPorDocumento,
  detectarGeneroPorDocumento,
  logCampoIa,
} from "@/lib/ia";

// Fluxo da IA (versão reescrita): regras fixas e previsíveis. O modelo NÃO
// conversa com o cliente — ele só LÊ o que o cliente escreveu (tipo, profissão,
// ponto fixo, dados) e o sistema decide o que fazer com isso.
//
//  Novo ──(cliente responde)──> Em conversa
//  Em conversa: diz que é motorista/comerciante → manda a mensagem pronta do tipo
//  Dados/documentos → Documentação (+ preenche a ficha com o que der pra ler)
//  CLT, dona de casa, atende a domicílio, comerciante sem ponto fixo → Venda perdida

const ETAPAS_FUNIL = ["Novo", "Em conversa", "Documentação"];
const TEMPLATE_POR_TIPO = { uber: "2 - Motorista de app", comerciante: "2 - comerciante" };
const MOTIVO_POR_OCUPACAO = {
  clt: ["CLT", "disse que trabalha de carteira assinada (CLT)"],
  dona_de_casa: ["Dona de casa", "disse que é dona de casa"],
  atende_domicilio: ["Atende em domicílio", "disse que atende a domicílio"],
};

async function pedirJson(system, user, apiKey) {
  try {
    const res = await fetch("https://api.deepinfra.com/v1/openai/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODELO_TEXTO,
        temperature: 0,
        max_tokens: 400,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`DeepInfra ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
    const txt = data?.choices?.[0]?.message?.content || "";
    const ini = txt.indexOf("{");
    const fim = txt.lastIndexOf("}");
    if (ini < 0 || fim < ini) return null;
    return JSON.parse(txt.slice(ini, fim + 1));
  } catch (err) {
    console.error("[fluxoIa] leitura da mensagem falhou:", err.message);
    return null;
  }
}

const SISTEMA_LEITURA = `Você lê UMA mensagem de um cliente de uma financeira de microcrédito (Capcred), que empresta para motoristas de aplicativo e comerciantes. Você NÃO responde ao cliente: só extrai informações. Responda APENAS com um JSON, sem texto fora dele, neste formato:

{
  "tipo": "motorista" | "comerciante" | null,
  "ocupacao": "clt" | "dona_de_casa" | "atende_domicilio" | null,
  "ponto_fixo": true | false | null,
  "trabalha_em_casa": true | false | null,
  "enviando_dados": true | false,
  "dados": { "nome": null, "cpf": null, "cnpj": null, "endereco_residencial": null, "endereco_comercial": null, "razao_social": null, "placa": null }
}

Regras:
- tipo: "motorista" se o cliente diz que é motorista de aplicativo (Uber, 99, InDrive, "motorista de app", "motorista", "faço corrida"); "comerciante" se diz que é comerciante / tem comércio, loja, negócio próprio. Resposta curta como "motorista" ou "comerciante" também vale. Se não disser, null.
- ocupacao: só se o cliente afirmar sobre SI MESMO. "clt" = trabalha de carteira assinada / registrado em empresa. "dona_de_casa" = é dona de casa / do lar. "atende_domicilio" = trabalha atendendo a domicílio / na casa dos clientes / sem local próprio de atendimento. Caso contrário, null. Motorista de aplicativo NÃO é clt.
- ponto_fixo: false se o cliente diz que NÃO tem ponto fixo, estabelecimento ou loja (ex.: trabalha na rua, ambulante, vende andando, sem local nenhum); true se diz que tem; null se não fala disso. Trabalhar EM CASA (cozinha de casa, ateliê em casa, vende de casa) CONTA como ponto fixo: use true.
- trabalha_em_casa: true se o cliente diz que o negócio funciona na própria casa/residência dele (ex.: "trabalho na cozinha de casa", "faço marmita em casa"); false ou null caso contrário. Atender na casa DOS CLIENTES não é isso (é "atende_domicilio"). Use a "última mensagem nossa" para entender respostas curtas como "não" ou "tenho".
- enviando_dados: true se a mensagem traz dados pessoais/cadastrais do cliente (nome completo, CPF, CNPJ, endereço, razão social, placa, telefones de referência). Só responder o tipo ("motorista") NÃO é enviar dados.
- dados: preencha SOMENTE o que está escrito na mensagem; nunca invente. cpf e cnpj só com dígitos. Campos ausentes = null.

Exemplos:
"Sou motorista de uber" -> {"tipo":"motorista","ocupacao":null,"ponto_fixo":null,"enviando_dados":false,"dados":{}}
"comerciante" -> {"tipo":"comerciante","ocupacao":null,"ponto_fixo":null,"enviando_dados":false,"dados":{}}
"Trabalho de carteira assinada numa loja" -> {"tipo":null,"ocupacao":"clt","ponto_fixo":null,"enviando_dados":false,"dados":{}}
"Sou dona de casa" -> {"tipo":null,"ocupacao":"dona_de_casa","ponto_fixo":null,"enviando_dados":false,"dados":{}}
"Sou manicure, atendo na casa das clientes" -> {"tipo":null,"ocupacao":"atende_domicilio","ponto_fixo":null,"enviando_dados":false,"dados":{}}
"Sou comerciante mas não tenho ponto fixo, vendo na rua" -> {"tipo":"comerciante","ocupacao":null,"ponto_fixo":false,"enviando_dados":false,"dados":{}}
"Tenho uma loja de roupas na rua tal" -> {"tipo":"comerciante","ocupacao":null,"ponto_fixo":true,"trabalha_em_casa":false,"enviando_dados":false,"dados":{}}
"Faço marmitas, trabalho na cozinha de casa" -> {"tipo":"comerciante","ocupacao":null,"ponto_fixo":true,"trabalha_em_casa":true,"enviando_dados":false,"dados":{}}
"Maria da Silva, cpf 123.456.789-09, moro na rua A 10 centro" -> {"tipo":null,"ocupacao":null,"ponto_fixo":null,"enviando_dados":true,"dados":{"nome":"Maria da Silva","cpf":"12345678909","endereco_residencial":"rua A 10 centro"}}
"Bom dia" -> {"tipo":null,"ocupacao":null,"ponto_fixo":null,"enviando_dados":false,"dados":{}}`;

export async function lerMensagem(texto, ultimaNossa, apiKey) {
  const r = await pedirJson(
    SISTEMA_LEITURA,
    `Última mensagem nossa: "${(ultimaNossa || "").slice(0, 300)}"\nMensagem do cliente: "${texto.slice(0, 1500)}"`,
    apiKey
  );
  return r && typeof r === "object" ? r : null;
}

async function garantirMotivo(nome) {
  await prisma.motivoPerda.upsert({ where: { nome }, update: {}, create: { nome } }).catch(() => {});
}

async function perder(contact, etapa, motivo, detalhe, acao) {
  await garantirMotivo(motivo);
  return autoMoverVendaPerdida({
    contact,
    currentStage: etapa,
    motivo,
    acaoAuditoria: acao,
    detalheAuditoria: `${contact.name}: ${detalhe} — movido para "Venda perdida" (${motivo})`,
  });
}

const apenasDigitos = (v) => String(v || "").replace(/\D/g, "");

// Preenche só o que está vazio — nunca sobrescreve o que a equipe já digitou.
async function preencherFicha(contact, dados) {
  const data = {};
  const cpf = apenasDigitos(dados.cpf);
  if (!contact.cpf && cpf.length === 11 && validarCPF(cpf)) data.cpf = cpf;
  const cnpj = apenasDigitos(dados.cnpj);
  if (!contact.cnpj && cnpj.length === 14) data.cnpj = cnpj;
  if (!contact.endereco && dados.endereco_residencial) data.endereco = String(dados.endereco_residencial).slice(0, 500);
  if (!contact.enderecoComercial && dados.endereco_comercial) data.enderecoComercial = String(dados.endereco_comercial).slice(0, 500);
  if (!contact.razaoSocial && dados.razao_social) data.razaoSocial = String(dados.razao_social).slice(0, 200);
  if (!contact.placaVeiculo && dados.placa) data.placaVeiculo = String(dados.placa).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  const nomeGenerico = /^[\d\s()+-]+$/.test((contact.name || "").trim()) || !contact.name?.trim();
  if (nomeGenerico && dados.nome && String(dados.nome).trim().split(/\s+/).length >= 2) data.name = String(dados.nome).trim().slice(0, 120);
  // Comércio na residência: o endereço residencial vale como comercial.
  const residencial = data.endereco || contact.endereco;
  if (contact.comercioNaResidencia && residencial && !contact.enderecoComercial && !data.enderecoComercial) data.enderecoComercial = residencial;
  const campos = Object.keys(data);
  if (!campos.length) return;
  await prisma.contact.update({ where: { id: contact.id }, data });
  Object.assign(contact, data);
  for (const c of campos) logCampoIa(contact.id, c, data[c]);
}

async function lerDocumento(contact, saved, apiKey) {
  const ehImagem = saved.kind === "image" || (saved.kind === "document" && (saved.mimeType || "").startsWith("image/"));
  const ehPdf = saved.kind === "document" && saved.mimeType === "application/pdf";
  if (!(ehImagem || ehPdf) || !saved.mediaUrl) return;
  const { readMediaAsBase64 } = await import("@/lib/mediaStorage");
  let base64 = await readMediaAsBase64(saved.mediaUrl);
  let mimetype = saved.mimeType;
  if (base64 && ehPdf) {
    const { pdfPrimeiraPaginaComoImagem } = await import("@/lib/pdfPreview");
    const conv = await pdfPrimeiraPaginaComoImagem(base64).catch(() => null);
    if (!conv) return;
    base64 = conv.base64;
    mimetype = conv.mimetype;
  }
  if (!base64) return;

  const [analise, cpf, endereco, genero] = await Promise.all([
    analyzeDocumentImage(base64, mimetype, saved.body, apiKey).catch(() => null),
    contact.cpf ? null : detectarCpfPorDocumento(base64, mimetype, apiKey).catch(() => null),
    contact.endereco ? null : detectarEnderecoPorDocumento(base64, mimetype, apiKey).catch(() => null),
    detectarGeneroPorDocumento(base64, mimetype, apiKey).catch(() => null),
  ]);
  const nome = analise?.match(/NOME_DETECTADO:\s*(.+)/i)?.[1]?.trim();
  await preencherFicha(contact, {
    cpf,
    endereco_residencial: endereco,
    nome: nome && nome.toLowerCase() !== "nenhum" ? nome : null,
  });
  if (genero) {
    await prisma.contact.update({ where: { id: contact.id }, data: { genero } }).catch(() => {});
    logCampoIa(contact.id, "genero", genero);
  }
}

// Ponto de entrada: chamado pelo webhook a cada mensagem RECEBIDA do cliente.
export async function fluxoIa({ contact, saved, instance, incomingAudio, leadNovo }) {
  const cfg = await getIaConfig();
  if (!cfg || cfg.iaGlobalPausada || contact.iaPausada || !cfg.deepinfraApiKey) return;
  const apiKey = cfg.deepinfraApiKey;

  let etapa = await prisma.stage.findUnique({ where: { id: contact.stageId } });
  if (!etapa || !ETAPAS_FUNIL.includes(etapa.name)) return; // só mexe de Novo até Documentação

  // Texto da mensagem (áudio vira texto)
  let texto = saved.kind === "text" ? saved.body || "" : "";
  if (saved.kind === "audio" && incomingAudio) {
    const t = await transcribeAudio(incomingAudio.base64, incomingAudio.mimetype, apiKey).catch(() => null);
    if (t) {
      texto = t;
      await prisma.message.update({ where: { id: saved.id }, data: { body: t } }).catch(() => {});
    }
  }

  // 1) Cliente respondeu à nossa mensagem → "Em conversa"
  if (etapa.name === "Novo" && !leadNovo) {
    const jaFalamos = await prisma.message.count({ where: { contactId: contact.id, fromMe: true } });
    if (jaFalamos > 0 && (await moveContactStage(contact.id, "Em conversa", instance).catch(() => false))) {
      const nova = await prisma.stage.findFirst({ where: { name: "Em conversa" } });
      if (nova) { etapa = nova; contact.stageId = nova.id; }
    }
  }

  // 2) Leitura do que o cliente escreveu
  let leitura = null;
  if (texto.trim()) {
    const ultima = await prisma.message.findFirst({
      where: { contactId: contact.id, fromMe: true },
      orderBy: { createdAt: "desc" },
      select: { body: true },
    });
    leitura = await lerMensagem(texto, ultima?.body, apiKey);
  }

  if (leitura) {
    // 3) Perfil que não atendemos → Venda perdida
    const oc = MOTIVO_POR_OCUPACAO[leitura.ocupacao];
    if (oc) {
      await perder(contact, etapa, oc[0], oc[1], "auto_venda_perdida_perfil");
      return;
    }

    // 4) Tipo de cliente → manda a mensagem pronta do tipo (uma vez)
    const tipo = leitura.tipo === "motorista" ? "uber" : leitura.tipo === "comerciante" ? "comerciante" : null;
    const tipoAtual = contact.tipoCliente || null;
    if (tipo && !tipoAtual && etapa.name !== "Documentação") {
      await prisma.contact.update({ where: { id: contact.id }, data: { tipoCliente: tipo } }).catch(() => {});
      contact.tipoCliente = tipo;
      logCampoIa(contact.id, "tipoCliente", tipo);
      await sendTemplateByTitle(TEMPLATE_POR_TIPO[tipo], contact, instance).catch(() => {});
    }

    // Comerciante que trabalha em casa: o endereço residencial vale como comercial.
    if (leitura.trabalha_em_casa === true && (contact.tipoCliente === "comerciante" || tipo === "comerciante") && !contact.comercioNaResidencia) {
      const data = { comercioNaResidencia: true };
      if (contact.endereco && !contact.enderecoComercial) data.enderecoComercial = contact.endereco;
      await prisma.contact.update({ where: { id: contact.id }, data }).catch(() => {});
      Object.assign(contact, data);
      logCampoIa(contact.id, "comercioNaResidencia", "sim (usa o endereço residencial como comercial)");
    }

    // 5) Comerciante sem ponto fixo → Venda perdida
    if ((contact.tipoCliente === "comerciante" || tipo === "comerciante") && leitura.ponto_fixo === false && leitura.trabalha_em_casa !== true && !contact.comercioNaResidencia) {
      await perder(contact, etapa, "Sem ponto fixo", "comerciante sem ponto fixo", "auto_venda_perdida_ponto_fixo");
      return;
    }

    // 6) Mandou dados → Documentação + preenche a ficha
    if (leitura.enviando_dados) {
      if (etapa.name !== "Documentação") await moveContactStage(contact.id, "Documentação", instance).catch(() => {});
      if (leitura.dados && typeof leitura.dados === "object") await preencherFicha(contact, leitura.dados).catch(() => {});
    }
  }

  // 7) Documento/foto → Documentação + lê o documento (CPF, endereço, nome, gênero)
  if (["image", "document"].includes(saved.kind)) {
    if (etapa.name !== "Documentação") await moveContactStage(contact.id, "Documentação", instance).catch(() => {});
    await lerDocumento(contact, saved, apiKey).catch((err) => console.error("[fluxoIa] documento:", err.message));
  }
}
