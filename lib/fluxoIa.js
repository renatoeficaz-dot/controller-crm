import { prisma } from "@/lib/prisma";
import { validarCPF } from "@/lib/cpf";
import { ufDoWhatsapp } from "@/lib/ddd";
import { FOLLOW_2, FOLLOW_3 } from "@/lib/followUp";
import { responderDuvida, FALLBACK_EQUIPE, RESPOSTA_SEM_DOC_FISICO } from "@/lib/fluxoDuvida";
import { serial, marcarChecklistDoc, atualizarMarcaReferencias, estadoDocumentacao, lerDocumento, perguntarProximo, tipoDosPassos } from "@/lib/fluxoDoc";
import {
  MODELO_TEXTO,
  getIaConfig,
  moveContactStage,
  autoMoverVendaPerdida,
  sendTemplateByTitle,
  transcribeAudio,
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

const MODELO_RESERVA = "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8";
const ETAPAS_FUNIL = ["Novo", "Em conversa", "Documentação"];
const RESPOSTA_FAMILIAR = "Pode sim! O comprovante pode estar no nome de um familiar, desde que você envie também um documento que comprove o vínculo com ele (por exemplo, certidão de nascimento ou de casamento).";
const AVISO_CPF_INVALIDO = "Esse CPF não parece válido. Pode conferir os números e me enviar de novo?";
const RESPOSTA_DIARIO = "Trabalhamos apenas com pagamento diário.";
const RESPOSTA_VISITA = "Só fazemos visita caso haja atraso no pagamento.";
const MOTIVO_POR_OCUPACAO = {
  clt: ["CLT", "disse que trabalha de carteira assinada (CLT)"],
  dona_de_casa: ["Dona de casa", "disse que é dona de casa"],
  atende_domicilio: ["Atende em domicílio", "disse que atende a domicílio"],
};

async function pedirJson(system, user, apiKey) {
  try {
    const montar = (model) => JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 400,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    });
    let res, data;
    // Modelo ocupado (429/5xx): tenta de novo e, se continuar ocupado, usa o modelo reserva.
    const modelos = [MODELO_TEXTO, MODELO_TEXTO, MODELO_RESERVA, MODELO_RESERVA];
    for (let t = 0; t < modelos.length; t++) {
      res = await fetch("https://api.deepinfra.com/v1/openai/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: montar(modelos[t]),
      });
      data = await res.json().catch(() => null);
      if (res.ok || (res.status !== 429 && res.status < 500)) break;
      await new Promise((r) => setTimeout(r, 2000 * (t + 1)));
    }
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
  "tem_cnpj": true | false | null,
  "pergunta_visita": true | false,
  "pergunta": true | false,
  "sem_documento_fisico": true | false,
  "comprovante_de_familiar": true | false,
  "endereco_igual": true | false,
  "quer_pagamento_nao_diario": true | false,
  "desistiu": true | false,
  "enviando_dados": true | false,
  "contatos": [ { "nome": string | null, "telefone": string } ],
  "dados": { "nome": null, "cpf": null, "cnpj": null, "endereco_residencial": null, "endereco_comercial": null, "razao_social": null, "placa": null }
}

Regras:
- tipo: "motorista" se o cliente diz que é motorista de aplicativo (Uber, 99, InDrive, "motorista de app", "motorista", "faço corrida"); "comerciante" se diz que é comerciante / tem comércio, loja, negócio próprio, ou se diz que é AUTÔNOMO / trabalha por conta própria / é MEI / vende por conta própria (autônomo que NÃO é motorista de aplicativo conta como comerciante; "motorista autônomo" ou "autônomo, faço Uber" continua sendo motorista). Resposta curta como "motorista" ou "comerciante" também vale. Se não disser, null.
- ocupacao: só se o cliente afirmar sobre SI MESMO. "clt" = diz que trabalha de carteira assinada / registrado em empresa (CLT). Quem diz que NÃO é CLT, que é PJ, MEI, autônomo ou dono de negócio NÃO é clt, mesmo que também tenha outro emprego ou salário. "dona_de_casa" = é dona de casa / do lar. "atende_domicilio" = trabalha atendendo a domicílio / na casa dos clientes / sem local próprio de atendimento. Caso contrário, null. Motorista de aplicativo NÃO é clt.
- ponto_fixo: false se o cliente diz que NÃO tem ponto fixo, estabelecimento ou loja (ex.: trabalha na rua, ambulante, vende andando, sem local nenhum); true se diz que tem; null se não fala disso. Trabalhar EM CASA (cozinha de casa, ateliê em casa, vende de casa) CONTA como ponto fixo: use true.
- trabalha_em_casa: true se o cliente diz que o negócio funciona na própria casa/residência dele (ex.: "trabalho na cozinha de casa", "faço marmita em casa"); false ou null caso contrário. Atender na casa DOS CLIENTES não é isso (é "atende_domicilio"). Use a "última mensagem nossa" para entender respostas curtas como "não" ou "tenho".
- tem_cnpj: false se o cliente diz que NÃO tem CNPJ ("não tenho cnpj", "sem cnpj", "ainda não abri empresa", "não tenho empresa"); true se diz que tem (inclui MEI); null se não fala disso. Use a "última mensagem nossa" para entender respostas curtas ("não") a uma pergunta sobre CNPJ.
- endereco_igual: true se o cliente diz que o endereço residencial e o comercial são o MESMO ("o endereço é o mesmo da loja", "moro no mesmo lugar do comércio", "é o mesmo endereço"). Senão false.
- comprovante_de_familiar: true se o cliente diz que o comprovante de residência/endereço NÃO é no nome dele e sim no nome de um familiar (filha, filho, mãe, pai, esposa, marido, irmão...) ou pergunta se pode ser no nome de outra pessoa. Senão false.
- pergunta: true se o cliente FAZ UMA PERGUNTA ou mostra dúvida/confusão que precisa de resposta ("qual rede social?", "como assim?", "1.500 não libera?", "qual o seu nome?", "precisa ser do mês?", "quanto tempo demora?"). false para saudação, agradecimento, dados enviados, respostas às nossas perguntas e conversa solta.
- sem_documento_fisico: true se o cliente diz que NÃO tem o documento físico/impresso ("não possuo documento físico", "só tenho o digital", "só tenho a CNH digital"). Senão false.
- pergunta_visita: true se o cliente PERGUNTA sobre visita (se vamos visitá-lo, ir até a casa/comércio, fazer visita, se alguém vai até lá). Senão false.
- quer_pagamento_nao_diario: true se o cliente diz que QUER ou pergunta se tem pagamento semanal, quinzenal ou mensal (qualquer forma de pagar que não seja diária). Senão false.
- desistiu: true SOMENTE se o cliente diz EXPLICITAMENTE que não quer mais / não tem interesse / desistiu / quer cancelar ("não quero mais", "desisti", "não tenho interesse", "deixa pra lá", "pode cancelar", "não preciso mais do empréstimo"). NÃO é desistir: não ter ou não poder fazer algo que pedimos ("não tenho CNPJ", "não posso fazer vídeo", "não tenho comprovante"), dúvidas, reclamar, dizer que vai demorar, agradecer, mandar dados ou endereço, "vou pensar". Na dúvida, false.
- enviando_dados: true SOMENTE se a mensagem traz um dado cadastral concreto do cliente: CPF, CNPJ, endereço, razão social, placa ou telefones de referência. Só dizer o NOME ("me chamo Roberta", "Maria da Silva"), responder o tipo ("motorista"), falar da profissão ou do negócio ("tenho oficina de costura") NÃO é enviar dados.
- contatos: pessoas que o cliente INDICA como contato de referência (parente, amigo, vizinho, conhecido) com telefone. Inclua só quando a mensagem traz um telefone (cole só os dígitos) e o nome da pessoa (ou o nome vem logo antes/depois do número, ou nossa última mensagem pediu contatos de referência). NÃO inclua o telefone do próprio cliente nem telefone do comércio dele. Lista vazia se não houver.
- dados: preencha SOMENTE o que está escrito na mensagem; nunca invente. cpf e cnpj só com dígitos. Campos ausentes = null.

Exemplos:
"Sou motorista de uber" -> {"tipo":"motorista","ocupacao":null,"ponto_fixo":null,"enviando_dados":false,"dados":{}}
"Autonomo" -> {"tipo":"comerciante","ocupacao":null,"ponto_fixo":null,"enviando_dados":false,"dados":{}}
"Sou autônomo, trabalho por conta própria" -> {"tipo":"comerciante","ocupacao":null,"ponto_fixo":null,"enviando_dados":false,"dados":{}}
"Sou motorista autônomo, faço Uber" -> {"tipo":"motorista","ocupacao":null,"ponto_fixo":null,"enviando_dados":false,"dados":{}}
"comerciante" -> {"tipo":"comerciante","ocupacao":null,"ponto_fixo":null,"enviando_dados":false,"dados":{}}
"Trabalho de carteira assinada numa loja" -> {"tipo":null,"ocupacao":"clt","ponto_fixo":null,"enviando_dados":false,"dados":{}}
"Tenho uma loja virtual e trabalho de gerente numa empresa, mas não tenho CLT, sou PJ" -> {"tipo":"comerciante","ocupacao":null,"ponto_fixo":null,"enviando_dados":false,"dados":{}}
"Sou dona de casa" -> {"tipo":null,"ocupacao":"dona_de_casa","ponto_fixo":null,"enviando_dados":false,"dados":{}}
"Sou manicure, atendo na casa das clientes" -> {"tipo":null,"ocupacao":"atende_domicilio","ponto_fixo":null,"enviando_dados":false,"dados":{}}
"Sou comerciante mas não tenho ponto fixo, vendo na rua" -> {"tipo":"comerciante","ocupacao":null,"ponto_fixo":false,"enviando_dados":false,"dados":{}}
"Tenho uma loja de roupas na rua tal" -> {"tipo":"comerciante","ocupacao":null,"ponto_fixo":true,"trabalha_em_casa":false,"enviando_dados":false,"dados":{}}
"Faço marmitas, trabalho na cozinha de casa" -> {"tipo":"comerciante","ocupacao":null,"ponto_fixo":true,"trabalha_em_casa":true,"enviando_dados":false,"dados":{}}
"Maria da Silva, cpf 123.456.789-09, moro na rua A 10 centro" -> {"tipo":null,"ocupacao":null,"ponto_fixo":null,"enviando_dados":true,"dados":{"nome":"Maria da Silva","cpf":"12345678909","endereco_residencial":"rua A 10 centro"}}
"Vocês fazem visita na minha casa?" -> {"tipo":null,"ocupacao":null,"ponto_fixo":null,"pergunta_visita":true,"enviando_dados":false,"dados":{}}
"Eu não tenho CNPJ ainda" -> {"tipo":null,"ocupacao":null,"ponto_fixo":null,"desistiu":false,"enviando_dados":false,"dados":{}}
"Não posso fazer vídeo" -> {"tipo":null,"ocupacao":null,"ponto_fixo":null,"desistiu":false,"enviando_dados":false,"dados":{}}
"Não tenho mais interesse" -> {"tipo":null,"ocupacao":null,"ponto_fixo":null,"desistiu":true,"enviando_dados":false,"dados":{}}
"Queria pagamento semanal" -> {"tipo":null,"ocupacao":null,"ponto_fixo":null,"quer_pagamento_nao_diario":true,"desistiu":false,"enviando_dados":false,"dados":{}}
"+55 11 98961-0709\nRafa" (nossa última mensagem pediu "os nomes e telefones dos 3 contatos de referência") -> {"tipo":null,"ocupacao":null,"ponto_fixo":null,"enviando_dados":true,"contatos":[{"nome":"Rafa","telefone":"5511989610709"}],"dados":{}}
"Não tenho CNPJ" -> {"tipo":null,"ocupacao":null,"ponto_fixo":null,"tem_cnpj":false,"enviando_dados":false,"dados":{}}
"Me chamo Roberta" -> {"tipo":null,"ocupacao":null,"ponto_fixo":null,"enviando_dados":false,"dados":{"nome":null}}
"Tenho oficina de costura" -> {"tipo":"comerciante","ocupacao":null,"ponto_fixo":null,"enviando_dados":false,"dados":{}}
"O endereço é o mesmo da loja" -> {"tipo":null,"ocupacao":null,"ponto_fixo":null,"endereco_igual":true,"enviando_dados":false,"dados":{}}
"Os comprovantes não são no meu nome, é no nome da minha filha, serve?" -> {"tipo":null,"ocupacao":null,"ponto_fixo":null,"comprovante_de_familiar":true,"enviando_dados":false,"dados":{}}
"Qual rede social?" -> {"tipo":null,"ocupacao":null,"ponto_fixo":null,"pergunta":true,"enviando_dados":false,"dados":{}}
"Não possuo documento físico" -> {"tipo":null,"ocupacao":null,"ponto_fixo":null,"sem_documento_fisico":true,"pergunta":false,"enviando_dados":false,"dados":{}}
"Deixa quieto" -> {"tipo":null,"ocupacao":null,"ponto_fixo":null,"desistiu":true,"pergunta":false,"enviando_dados":false,"dados":{}}
"Diária não dá pra mim não" -> {"tipo":null,"ocupacao":null,"ponto_fixo":null,"desistiu":true,"pergunta":false,"enviando_dados":false,"dados":{}}
"Achei que fosse empréstimo pra CLT" -> {"tipo":null,"ocupacao":null,"ponto_fixo":null,"desistiu":true,"pergunta":false,"enviando_dados":false,"dados":{}}
"Tenho salão de beleza como funciona o empréstimo ?" -> {"tipo":"comerciante","ocupacao":null,"ponto_fixo":null,"pergunta":true,"enviando_dados":false,"dados":{}}
"Ah ok" -> {"tipo":null,"ocupacao":null,"ponto_fixo":null,"pergunta":false,"enviando_dados":false,"dados":{}}
"Tá bom" -> {"tipo":null,"ocupacao":null,"ponto_fixo":null,"pergunta":false,"enviando_dados":false,"dados":{}}
"Chamei errado é pra comércio esse né" -> {"tipo":"comerciante","ocupacao":null,"ponto_fixo":null,"pergunta":false,"enviando_dados":false,"dados":{}}
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

async function perder(contact, etapa, motivo, detalhe, acao, instance, forcar = false) {
  await garantirMotivo(motivo);
  const moveu = await autoMoverVendaPerdida({
    contact,
    currentStage: etapa,
    motivo,
    acaoAuditoria: acao,
    detalheAuditoria: `${contact.name}: ${detalhe} — movido para "Venda perdida" (${motivo})`,
    forcar,
  });
  // Mensagem automática ligada ao motivo (Configurações → Motivos de perda) — mesma regra do
  // movimento manual no Kanban. Antes só o movimento manual enviava.
  if (moveu && instance) {
    const m = await prisma.motivoPerda.findUnique({ where: { nome: motivo }, include: { template: true } }).catch(() => null);
    if (m?.template) await sendTemplateByTitle(m.template.title, contact, instance).catch(() => {});
  }
  return moveu;
}

const apenasDigitos = (v) => String(v || "").replace(/\D/g, "");

async function preencherFicha(contact, dados) {
  // O cliente responde ao endereço que PEDIMOS: se o modelo classificou no campo errado, corrige pelo pedido atual.
  if (contact.docPedido === "enderecoComercial" && dados.endereco_residencial && !dados.endereco_comercial) {
    dados = { ...dados, endereco_comercial: dados.endereco_residencial, endereco_residencial: null };
  } else if (contact.docPedido === "enderecoResidencial" && dados.endereco_comercial && !dados.endereco_residencial) {
    dados = { ...dados, endereco_residencial: dados.endereco_comercial, endereco_comercial: null };
  }
  const data = {};
  const cpf = apenasDigitos(dados.cpf);
  if (!contact.cpf && cpf.length === 11 && validarCPF(cpf)) data.cpf = cpf;
  const cnpj = apenasDigitos(dados.cnpj);
  if (!contact.cnpj && cnpj.length === 14) data.cnpj = cnpj;
  if (!contact.endereco && dados.endereco_residencial) data.endereco = String(dados.endereco_residencial).slice(0, 500);
  if (!contact.enderecoComercial && dados.endereco_comercial) data.enderecoComercial = String(dados.endereco_comercial).slice(0, 500);
  if (!contact.razaoSocial && dados.razao_social) data.razaoSocial = String(dados.razao_social).slice(0, 200);
  if (!contact.placaVeiculo && dados.placa) data.placaVeiculo = String(dados.placa).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  // O nome do lead vem do WhatsApp ("DG", "Vanessa ✨", só o telefone...). Quando o
  // documento revela o nome completo, passa a valer o do documento — a menos que o
  // lead já tenha um nome completo (escrito pela equipe), que nunca é sobrescrito.
  const nomeAtualCompleto = (contact.name || "").trim().split(/\s+/).filter((t) => /^[A-Za-zÀ-ÿ'.-]{2,}$/.test(t)).length >= 2;
  const nomeNovo = String(dados.nome || "").trim();
  if (!nomeAtualCompleto && nomeNovo.split(/\s+/).length >= 2 && /^[A-Za-zÀ-ÿ'. -]+$/.test(nomeNovo)) {
    // Documento vem em CAIXA ALTA ("JOAO DA SILVA"): deixa como nome próprio.
    const arruma = (n) => (n === n.toUpperCase()
      ? n.toLowerCase().replace(/(^|\s)([a-zà-ÿ])/g, (m, e, l) => e + l.toUpperCase()).replace(/\s(Da|De|Do|Das|Dos|E)(?=\s)/g, (m, x) => " " + x.toLowerCase())
      : n);
    data.name = arruma(nomeNovo.replace(/\s+/g, " ")).slice(0, 120);
  }
  // Comércio na residência: o endereço residencial vale como comercial.
  const residencial = data.endereco || contact.endereco;
  if (contact.comercioNaResidencia && residencial && !contact.enderecoComercial && !data.enderecoComercial) data.enderecoComercial = residencial;
  const campos = Object.keys(data);
  if (!campos.length) return;
  await prisma.contact.update({ where: { id: contact.id }, data });
  Object.assign(contact, data);
  for (const c of campos) logCampoIa(contact.id, c, data[c]);
  const marcar = [];
  if (data.cpf) marcar.push("cpf");
  if (data.cnpj) marcar.push("cnpj");
  if (data.endereco) marcar.push("enderecoResidencial", "endereco");
  if (data.enderecoComercial) marcar.push("enderecoComercial");
  await marcarChecklistDoc(contact.id, marcar).catch(() => {});
}

// Cria os contatos de referência (sem repetir e sem aceitar o telefone do próprio cliente),
// espelha os 3 primeiros nos campos "Parente / Contato 2 / Contato 3" da conferência e
// marca "contatos de referência" no checklist quando chegar a 3.
export async function salvarReferencias(contact, lista) {
  const { normalizeBrPhone } = await import("@/lib/evolution");
  const existentes = await prisma.contatoReferencia.findMany({ where: { contactId: contact.id }, select: { telefone: true } });
  const jaTem = new Set(existentes.map((r) => r.telefone.slice(-8)));
  const proprio = String(contact.phone || "").slice(-8);
  let criou = false;
  for (const c of lista.slice(0, 6)) {
    const tel = normalizeBrPhone(String(c?.telefone || ""));
    if (!tel || jaTem.has(tel.slice(-8))) continue;
    // O contato do comércio costuma ser o próprio número do cliente: vale uma vez só, para comerciante.
    if (tel.slice(-8) === proprio && contact.tipoCliente !== "comerciante") continue;
    const nome = String(c?.nome || "").trim().slice(0, 200) || "Sem nome";
    await prisma.contatoReferencia.create({ data: { contactId: contact.id, nome, telefone: tel } });
    jaTem.add(tel.slice(-8));
    criou = true;
    logCampoIa(contact.id, "contato de referência", `${nome} — ${tel}`);
  }
  if (!criou) return;
  await atualizarMarcaReferencias(contact.id);
}

// Endereço residencial e comercial iguais: copia o que existe para o campo que está vazio.
async function aplicarEnderecoIgual(contact) {
  const data = {};
  const marcar = [];
  if (contact.enderecoComercial && !contact.endereco) { data.endereco = contact.enderecoComercial; marcar.push("enderecoResidencial"); }
  else if (contact.endereco && !contact.enderecoComercial) { data.enderecoComercial = contact.endereco; marcar.push("enderecoComercial"); }
  if (!Object.keys(data).length) return;
  await prisma.contact.update({ where: { id: contact.id }, data });
  Object.assign(contact, data);
  for (const k of Object.keys(data)) logCampoIa(contact.id, k, data[k]);
  await marcarChecklistDoc(contact.id, marcar).catch(() => {});
}

// Marca o checklist e preenche a ficha a partir de UMA mídia recebida (foto, PDF ou vídeo).
async function aplicarMidia(contact, saved, apiKey) {
  const ehVideo = saved.kind === "document" && String(saved.mimeType || "").startsWith("video/");
  if (ehVideo) {
    // Vídeo não é analisado: vale para o primeiro passo de vídeo ainda pendente.
    const e = await estadoDocumentacao(contact.id);
    const pendenteVideo = e?.passos?.find((p) => p.tipo === "video" && !e.feitos.has(p.chave));
    if (pendenteVideo) await marcarChecklistDoc(contact.id, [pendenteVideo.chave]);
    return;
  }
  const lido = await lerDocumento(contact, saved, apiKey).catch((err) => { console.error("[fluxoIa] documento:", err.message); return null; });
  if (!lido) return;
  await preencherFicha(contact, lido.dados).catch(() => {});
  if (lido.marcas.length) await marcarChecklistDoc(contact.id, lido.marcas).catch(() => {});
  if (lido.cnpjInvalido) logCampoIa(contact.id, "cnpj (lido da imagem, dígitos não conferem — confira na foto)", lido.cnpjInvalido);
  if (lido.genero) {
    await prisma.contact.update({ where: { id: contact.id }, data: { genero: lido.genero } }).catch(() => {});
    logCampoIa(contact.id, "genero", lido.genero);
  }
}

// Fotos/vídeos que o cliente mandou ANTES do atendimento por etapas: lê todas uma única vez
// (silenciosamente) para marcar o checklist e não pedir de novo o que já foi enviado.
async function garantirHistoricoLido(contactId, apiKey, ignorarId) {
  const c = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!c || c.docHistoricoLido) return;
  const midias = await prisma.message.findMany({
    where: { contactId, fromMe: false, kind: { in: ["image", "document"] }, id: { not: ignorarId || "" } },
    orderBy: { createdAt: "asc" },
  });
  for (const m of midias) await aplicarMidia(c, m, apiKey).catch(() => {});
  // Textos antigos com cara de dado (endereço, CPF, CNPJ, "é o mesmo da loja", telefones...).
  const textos = await prisma.message.findMany({
    where: { contactId, fromMe: false, kind: "text", id: { not: ignorarId || "" } },
    orderBy: { createdAt: "asc" },
    select: { body: true },
  });
  const candidatos = textos.filter((t) => /\d{5,}|endere|\brua\b|avenida|\bav\b|cnpj|cpf|mesmo/i.test(t.body || "")).slice(-25);
  for (const t of candidatos) {
    const leitura = await lerMensagem(t.body, "", apiKey).catch(() => null);
    if (!leitura) continue;
    if (leitura.dados && typeof leitura.dados === "object") await preencherFicha(c, leitura.dados).catch(() => {});
    if (Array.isArray(leitura.contatos) && leitura.contatos.length) await salvarReferencias(c, leitura.contatos).catch(() => {});
    if (leitura.endereco_igual === true) await aplicarEnderecoIgual(c).catch(() => {});
  }
  await prisma.contact.update({ where: { id: contactId }, data: { docHistoricoLido: true } });
}

// Ponto de entrada: chamado pelo webhook a cada mensagem RECEBIDA do cliente.
export async function fluxoIa(args) {
  const id = args.contact.id;
  try {
    const r = await serial(id, () => processar(args));
    // O pedido do próximo documento acontece FORA da fila (espera a rajada de envios acabar).
    if (r && r.perguntar) {
      await perguntarProximo({ contactId: id, instance: args.instance, savedAt: args.saved.createdAt, mudou: r.mudou, retomar: r.retomar, jaEnviou: r.jaEnviou, texto: r.texto, ehMidia: r.ehMidia, preparar: () => garantirHistoricoLido(id, r.apiKey, args.saved.id) });
    }
  } finally {
    // Só marca como tratada se chegou até aqui: se o servidor reiniciar no meio, a varredura retoma.
    if (!args.contact._leituraFalhou) await prisma.contact.updateMany({
      where: { id, OR: [{ iaProcessouAte: null }, { iaProcessouAte: { lt: args.saved.createdAt } }] },
      data: { iaProcessouAte: args.saved.createdAt },
    }).catch(() => {});
  }
}

async function processar({ contact, saved, instance, incomingAudio, leadNovo }) {
  const cfg = await getIaConfig();
  if (!cfg || cfg.iaGlobalPausada || contact.iaPausada || !cfg.deepinfraApiKey) return;
  const apiKey = cfg.deepinfraApiKey;

  let etapa = await prisma.stage.findUnique({ where: { id: contact.stageId } });
  if (!etapa || !ETAPAS_FUNIL.includes(etapa.name)) return; // só mexe de Novo até Documentação

  // Estado (UF) pelo DDD do WhatsApp — tabela oficial, sem adivinhar. Só preenche se vazio.
  if (!contact.estado) {
    const uf = ufDoWhatsapp(contact.phone);
    if (uf) {
      await prisma.contact.update({ where: { id: contact.id }, data: { estado: uf } }).catch(() => {});
      contact.estado = uf;
      logCampoIa(contact.id, "estado", uf);
    }
  }

  // Quantos passos do checklist estavam prontos antes desta mensagem (pra saber se ela avançou algo).
  const antes = (await estadoDocumentacao(contact.id))?.feitos.size || 0;

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

  // Cliente diz que já mandou o item pedido → perguntarProximo explica o que ainda falta.
  {
    const ultNossa = await prisma.message.findFirst({ where: { contactId: contact.id, fromMe: true }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
    const recentes = await prisma.message.findMany({ where: { contactId: contact.id, fromMe: false, kind: "text", createdAt: { gt: ultNossa?.createdAt || new Date(0) } }, select: { body: true }, take: 5 });
    if (recentes.some((m) => /j[aá]\s+(enviei|mandei|foi|enviado|mandado)/i.test(String(m.body || "")))) contact._jaEnviou = true;
  }

  // 2) Leitura do que o cliente escreveu
  let leitura = null;
  let ultimaNossaTexto = "";
  if (texto.trim()) {
    const ultima = await prisma.message.findFirst({
      where: { contactId: contact.id, fromMe: true },
      orderBy: { createdAt: "desc" },
      select: { body: true },
    });
    ultimaNossaTexto = ultima?.body || "";
    leitura = await lerMensagem(texto, ultima?.body, apiKey);
    if (!leitura) contact._leituraFalhou = true; // modelo indisponível: a varredura tenta de novo depois
  }

  // Pedimos o CPF e o cliente mandou só números com tamanho errado → avisa (o modelo nem sempre trata).
  if (contact.docPedido === "cpf" && !contact.cpf && /^[\d.\-\s]+$/.test(texto.trim())) {
    const dig = texto.replace(/\D/g, "");
    if (dig.length >= 8 && dig.length !== 14 && (dig.length !== 11 || !validarCPF(dig))) {
      const jaAvisou = await prisma.message.count({ where: { contactId: contact.id, fromMe: true, body: AVISO_CPF_INVALIDO, createdAt: { gt: saved.createdAt } } });
      if (!jaAvisou) {
        const { sendWhatsappText } = await import("@/lib/evolution");
        const r = await sendWhatsappText(contact.phone, AVISO_CPF_INVALIDO, instance).catch(() => ({ ok: false }));
        await prisma.message.create({ data: { contactId: contact.id, enviadoPor: "IA", body: AVISO_CPF_INVALIDO, kind: "text", fromMe: true, status: r.simulated ? "simulado" : r.ok ? "enviado" : "erro", instance } });
      }
      return;
    }
  }

  if (leitura) {
    // 3) Perfil que não atendemos → Venda perdida
    const oc = MOTIVO_POR_OCUPACAO[leitura.ocupacao];
    if (oc) {
      await perder(contact, etapa, oc[0], oc[1], "auto_venda_perdida_perfil", instance);
      return;
    }

    // 3b) Cliente não quer mais → Venda perdida (cancelou)
    // "Obrigado"/"valeu"/"ok obrigado" seco em resposta ao nosso "?" ou ao "só trabalhamos com pagamento
    // diário" = cliente encerrando (decidido aqui,
    // não pelo modelo, pra não errar com agradecimento normal).
    const agradeceuAoPonto = (ultimaNossaTexto.trim() === "?" || ultimaNossaTexto.trim() === RESPOSTA_DIARIO) && /^(muito\s+)?(obrigad[oa]|brigad[oa]|valeu|ok,?\s*obrigad[oa])[\s.!]*$/i.test(texto.trim());
    // Resposta negativa ao nosso follow-up ("?", "Vai querer dar segmento?", "...capital de giro?") → cancelou.
    // Esta é a única perda que a IA faz sozinha (as demais só viram tarefa por enquanto).
    const ult = ultimaNossaTexto.trim();
    const aposFollowUp = ult === "?" || ult === FOLLOW_2 || ult === FOLLOW_3;
    const negativo = /^(n[aã]o|nao quero|n[aã]o,?\s*obrigad[oa]|agora n[aã]o|n[aã]o quero( mais)?|n[aã]o tenho interesse)[\s.!]*$/i.test(texto.trim());
    if (leitura.desistiu === true || agradeceuAoPonto || (aposFollowUp && negativo)) {
      await perder(contact, etapa, "cancelou", "cliente não quer mais (desistiu)", "auto_venda_perdida_cancelou", instance, aposFollowUp);
      return;
    }

    // 4) Tipo de cliente → preenche o campo (o pedido do 1º documento sai depois, em perguntarProximo)
    const tipo = leitura.tipo === "motorista" ? "uber" : leitura.tipo === "comerciante" ? "comerciante" : null;
    const tipoAtual = contact.tipoCliente || null;
    if (tipo && !tipoAtual) {
      await prisma.contact.update({ where: { id: contact.id }, data: { tipoCliente: tipo } }).catch(() => {});
      contact.tipoCliente = tipo;
      logCampoIa(contact.id, "tipoCliente", tipo);
    }

    // Comerciante sem CNPJ → Venda perdida
    if ((contact.tipoCliente === "comerciante" || tipo === "comerciante") && leitura.tem_cnpj === false && !contact.cnpj) {
      await perder(contact, etapa, "Sem CNPJ", "comerciante sem CNPJ", "auto_venda_perdida_sem_cnpj", instance);
      return;
    }

    // Comprovante em nome de familiar → pode, com documento que comprove o vínculo
    if (leitura.comprovante_de_familiar === true) {
      if (!contact.comprovanteDeTerceiro) {
        await prisma.contact.update({ where: { id: contact.id }, data: { comprovanteDeTerceiro: true } }).catch(() => {});
        contact.comprovanteDeTerceiro = true;
        logCampoIa(contact.id, "comprovanteDeTerceiro", "sim (comprovante em nome de familiar — exige documento de vínculo)");
      }
      const jaDisse = await prisma.message.count({ where: { contactId: contact.id, fromMe: true, body: RESPOSTA_FAMILIAR, createdAt: { gte: new Date(Date.now() - 6 * 3600e3) } } });
      if (!jaDisse) {
        const { sendWhatsappText } = await import("@/lib/evolution");
        const r = await sendWhatsappText(contact.phone, RESPOSTA_FAMILIAR, instance).catch(() => ({ ok: false }));
        await prisma.message.create({ data: { contactId: contact.id, enviadoPor: "IA", body: RESPOSTA_FAMILIAR, kind: "text", fromMe: true, status: r.simulated ? "simulado" : r.ok ? "enviado" : "erro", instance } });
      }
    }

    // Não tem o documento físico → pede foto de uma tela mostrando o documento digital
    if (leitura.sem_documento_fisico === true) {
      const jaFalou = await prisma.message.count({ where: { contactId: contact.id, fromMe: true, body: RESPOSTA_SEM_DOC_FISICO, createdAt: { gte: new Date(Date.now() - 6 * 3600e3) } } });
      if (!jaFalou) {
        const { sendWhatsappText } = await import("@/lib/evolution");
        const r = await sendWhatsappText(contact.phone, RESPOSTA_SEM_DOC_FISICO, instance).catch(() => ({ ok: false }));
        await prisma.message.create({ data: { contactId: contact.id, enviadoPor: "IA", body: RESPOSTA_SEM_DOC_FISICO, kind: "text", fromMe: true, status: r.simulated ? "simulado" : r.ok ? "enviado" : "erro", instance } });
      }
    }

    // Dúvida do cliente (que as regras fixas acima não cobrem) → responde com a base de conhecimento;
    // se não souber, avisa que a equipe responde e cria uma tarefa para o responsável.
    const respondeuFixo = leitura.quer_pagamento_nao_diario === true || leitura.pergunta_visita === true || leitura.comprovante_de_familiar === true || leitura.sem_documento_fisico === true;
    if (leitura.pergunta === true && !respondeuFixo) {
      const e = await estadoDocumentacao(contact.id);
      const resposta = await responderDuvida({ contact, texto, apiKey, passoPedido: e?.proximo?.pedido });
      const corpo = resposta || FALLBACK_EQUIPE;
      const repetido = await prisma.message.count({ where: { contactId: contact.id, fromMe: true, body: corpo, createdAt: { gte: new Date(Date.now() - (resposta ? 6 * 3600e3 : 30 * 60e3)) } } });
      if (!repetido) {
        contact._respondeuDuvida = true;
        const { sendWhatsappText } = await import("@/lib/evolution");
        const r = await sendWhatsappText(contact.phone, corpo, instance).catch(() => ({ ok: false }));
        await prisma.message.create({ data: { contactId: contact.id, enviadoPor: "IA", body: corpo, kind: "text", fromMe: true, status: r.simulated ? "simulado" : r.ok ? "enviado" : "erro", instance } });
        if (!resposta) {
          await prisma.task.create({ data: { contactId: contact.id, title: "Cliente com dúvida — responder", notes: String(texto).slice(0, 300), dueDate: new Date(), responsavel: contact.responsavel || null } }).catch(() => {});
        }
      }
    }

    // Cliente quer pagamento semanal/quinzenal/mensal → resposta fixa (só diário).
    if (leitura.quer_pagamento_nao_diario === true) {
      const jaRespondeuDiario = await prisma.message.count({
        where: { contactId: contact.id, fromMe: true, body: RESPOSTA_DIARIO, createdAt: { gte: new Date(Date.now() - 6 * 3600e3) } },
      });
      if (!jaRespondeuDiario) {
        contact._respondeuDuvida = true;
        const { sendWhatsappText } = await import("@/lib/evolution");
        const r = await sendWhatsappText(contact.phone, RESPOSTA_DIARIO, instance).catch(() => ({ ok: false }));
        await prisma.message.create({
          data: { contactId: contact.id, enviadoPor: "IA", body: RESPOSTA_DIARIO, kind: "text", fromMe: true, status: r.simulated ? "simulado" : r.ok ? "enviado" : "erro", instance },
        });
      }
    }

    // Cliente perguntou sobre visita → resposta fixa (visita só se houver atraso).
    if (leitura.pergunta_visita === true) {
      const jaRespondeu = await prisma.message.count({
        where: { contactId: contact.id, fromMe: true, body: RESPOSTA_VISITA, createdAt: { gte: new Date(Date.now() - 6 * 3600e3) } },
      });
      if (!jaRespondeu) {
        contact._respondeuDuvida = true;
        const { sendWhatsappText } = await import("@/lib/evolution");
        const r = await sendWhatsappText(contact.phone, RESPOSTA_VISITA, instance).catch(() => ({ ok: false }));
        await prisma.message.create({
          data: { contactId: contact.id, enviadoPor: "IA", body: RESPOSTA_VISITA, kind: "text", fromMe: true, status: r.simulated ? "simulado" : r.ok ? "enviado" : "erro", instance },
        });
      }
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
      await perder(contact, etapa, "Sem ponto fixo", "comerciante sem ponto fixo", "auto_venda_perdida_ponto_fixo", instance);
      return;
    }

    // 5a) "O endereço é o mesmo da loja" → copia um para o outro
    if (leitura.endereco_igual === true) await aplicarEnderecoIgual(contact).catch(() => {});

    // 5b) Contatos de referência escritos no texto → seção "Contatos de referência"
    if (Array.isArray(leitura.contatos) && leitura.contatos.length) {
      await salvarReferencias(contact, leitura.contatos).catch((err) => console.error("[fluxoIa] referências:", err.message));
    }

    // 6) Mandou dados → Documentação + preenche a ficha
    // Só um dado concreto (CPF, CNPJ, endereço, razão social, placa, contatos) conta como "mandou
    // os dados" — nome sozinho não move o lead. Conferido aqui, sem confiar só na flag do modelo.
    const d = leitura.dados && typeof leitura.dados === "object" ? leitura.dados : {};
    // CPF digitado com dígitos que não fecham → avisa o cliente (antes a IA ficava em silêncio e "parava").
    const cpfDigitado = apenasDigitos(d.cpf);
    if (cpfDigitado.length === 11 && !validarCPF(cpfDigitado) && !contact.cpf) {
      const recente = await prisma.message.count({ where: { contactId: contact.id, fromMe: true, body: AVISO_CPF_INVALIDO, createdAt: { gt: saved.createdAt } } });
      if (!recente) {
        const { sendWhatsappText } = await import("@/lib/evolution");
        const r = await sendWhatsappText(contact.phone, AVISO_CPF_INVALIDO, instance).catch(() => ({ ok: false }));
        await prisma.message.create({ data: { contactId: contact.id, enviadoPor: "IA", body: AVISO_CPF_INVALIDO, kind: "text", fromMe: true, status: r.simulated ? "simulado" : r.ok ? "enviado" : "erro", instance } });
      }
    }
    const temDadoConcreto = !!(d.cpf || d.cnpj || d.endereco_residencial || d.endereco_comercial || d.razao_social || d.placa)
      || (Array.isArray(leitura.contatos) && leitura.contatos.length > 0);
    if (temDadoConcreto && etapa.name !== "Documentação") await moveContactStage(contact.id, "Documentação", instance).catch(() => {});
    // A ficha é preenchida com o que vier (inclusive só o nome completo), sem mover o lead.
    if (leitura.dados && typeof leitura.dados === "object") await preencherFicha(contact, leitura.dados).catch(() => {});
  }

  // 7) Documento/foto/vídeo → Documentação + marca o passo do checklist e lê o documento
  const ehVideo = saved.kind === "document" && String(saved.mimeType || "").startsWith("video/");
  const ehMidia = ["image", "document"].includes(saved.kind);
  if (ehMidia) {
    if (etapa.name !== "Documentação") await moveContactStage(contact.id, "Documentação", instance).catch(() => {});
    await aplicarMidia(contact, saved, apiKey);
  }

  const depois = await estadoDocumentacao(contact.id);
  return { perguntar: true, retomar: !!contact._respondeuDuvida, jaEnviou: !!contact._jaEnviou, texto, ehMidia, apiKey, mudou: !!depois && depois.feitos.size > antes };
}
