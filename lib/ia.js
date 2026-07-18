import { prisma } from "@/lib/prisma";
import { ufFromPhone } from "@/lib/ddd";

// minúsculo e sem acento, pra comparar nomes de etapa sem depender de acentuação exata
function normalizeStageName(name) {
  return (name || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
}

export async function getIaConfig() {
  return prisma.config.findUnique({ where: { id: "singleton" } }).catch(() => null);
}

const UFS_VALIDAS = new Set([
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
]);

// Detecta se o cliente mencionou onde mora (cidade/estado) na mensagem, usando
// um modelo BARATO de texto — só roda enquanto o lead ainda não tem estado
// identificado, pra não gastar toa em toda mensagem depois de já ter achado.
export async function detectarEstadoConversa(texto, apiKey) {
  if (!apiKey || !texto?.trim() || texto.length > 500) return null;
  try {
    const res = await fetch("https://api.deepinfra.com/v1/openai/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
        messages: [
          {
            role: "user",
            content:
              `Mensagem de um cliente de empréstimo: "${texto}"\n\n` +
              `Essa mensagem menciona uma cidade, bairro ou estado brasileiro onde o cliente mora? ` +
              `Se sim, responda APENAS com a sigla do estado (2 letras, ex.: SP, BA, MG). Se não houver nenhuma menção de local, responda APENAS "nenhum". Não escreva mais nada.`,
          },
        ],
        max_tokens: 5,
        temperature: 0,
      }),
    });
    const data = await res.json().catch(() => null);
    const raw = (data?.choices?.[0]?.message?.content || "").trim().toUpperCase().replace(/[^A-Z]/g, "");
    return UFS_VALIDAS.has(raw) ? raw : null;
  } catch {
    return null;
  }
}

// Detecta o gênero do lead pelo nome (pushName do WhatsApp ou nome cadastrado),
// usando o mesmo modelo BARATO de texto. Roda uma vez só, quando o lead é
// criado — nomes genéricos ("cliente", números, emoji) a IA já responde
// "indefinido" sozinha, então não força um chute errado.
export async function detectarGeneroPorNome(nome, apiKey) {
  if (!apiKey || !nome?.trim()) return null;
  try {
    const res = await fetch("https://api.deepinfra.com/v1/openai/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
        messages: [
          {
            role: "user",
            content:
              `Nome de um cliente brasileiro de empréstimo: "${nome}"\n\n` +
              `Esse é um nome próprio de pessoa (não apelido genérico, número de telefone, nome de empresa ou emoji)? ` +
              `Se sim, qual o gênero mais provável pelo nome? Responda APENAS uma palavra: "masculino", "feminino" ou "indefinido" (se não for um nome próprio reconhecível ou for ambíguo). Não escreva mais nada.`,
          },
        ],
        max_tokens: 5,
        temperature: 0,
      }),
    });
    const data = await res.json().catch(() => null);
    const raw = (data?.choices?.[0]?.message?.content || "").trim().toLowerCase().replace(/[^a-zãéíóú]/g, "");
    return raw === "masculino" || raw === "feminino" ? raw : null;
  } catch {
    return null;
  }
}

// Analisa uma imagem/documento recebido do lead com um modelo de visão,
// pra dar pra IA de texto um contexto sobre se o arquivo parece correto
// (tipo certo, legível) antes dela decidir a resposta. Não é prova contra
// fraude — só pega erros grosseiros (documento errado, ilegível, cortado).
export async function analyzeDocumentImage(base64, mimetype, caption, apiKey) {
  if (!apiKey || !base64) return null;
  const prompt =
    `Você é um verificador de documentos para um empréstimo pessoal. Analise esta imagem e responda em português, em no máximo 4 linhas:\n` +
    `1. Que tipo de documento parece ser (CNH, comprovante de residência, selfie com documento, print de rede social, documento do veículo, contrato de locação, foto do carro com placa, etc.) ou diga que não reconhece.\n` +
    `2. Se está legível (não borrado, não cortado, informação visível).\n` +
    `3. Só aponte suspeita de edição/adulteração se for muito óbvio — não invente sem motivo.\n` +
    `4. Se for um documento de identificação com nome de pessoa visível (CNH, RG, comprovante de residência, contrato), adicione uma última linha EXATAMENTE no formato "NOME_DETECTADO: Nome Completo" com o nome completo que aparece no documento. Se não houver nome legível, escreva "NOME_DETECTADO: nenhum".` +
    (caption ? `\nLegenda enviada pelo cliente: "${caption}"` : "");

  try {
    const res = await fetch("https://api.deepinfra.com/v1/openai/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:${mimetype};base64,${base64}` } },
            ],
          },
        ],
        max_tokens: 200,
      }),
    });
    const data = await res.json().catch(() => null);
    return data?.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

// Detecta o gênero do lead a partir de uma foto de documento (RG/CNH — pelo
// campo "Sexo" quando visível — ou pela selfie/foto da pessoa). Mais confiável
// que só o nome, então essa detecção pode sobrescrever o que veio do nome.
export async function detectarGeneroPorDocumento(base64, mimetype, apiKey) {
  if (!apiKey || !base64) return null;
  try {
    const res = await fetch("https://api.deepinfra.com/v1/openai/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  `Essa imagem é um documento de identificação (RG, CNH, CPF) ou uma foto/selfie de uma pessoa? ` +
                  `Baseado no campo "Sexo"/"Sex" do documento (se estiver visível) ou na aparência da pessoa na foto, qual o gênero dela? ` +
                  `Responda APENAS uma palavra: "masculino", "feminino" ou "indefinido" (se a imagem não mostrar pessoa nem documento, ou não der pra saber). Não escreva mais nada.`,
              },
              { type: "image_url", image_url: { url: `data:${mimetype};base64,${base64}` } },
            ],
          },
        ],
        max_tokens: 5,
      }),
    });
    const data = await res.json().catch(() => null);
    const raw = (data?.choices?.[0]?.message?.content || "").trim().toLowerCase().replace(/[^a-zãéíóú]/g, "");
    return raw === "masculino" || raw === "feminino" ? raw : null;
  } catch {
    return null;
  }
}

// Agente de IA vinculado a uma instância (número) da Evolution, ou null se
// nenhum agente estiver atribuído a esse número (IA desligada por lá).
export async function getAgentForInstance(instance) {
  if (!instance) return null;
  const num = await prisma.whatsappNumber.findFirst({
    where: { instance },
    include: { agent: { include: { stopAtStage: true } } },
  });
  return num?.agent || null;
}

// true se o agente deve ficar em silêncio nesta etapa (ela ou qualquer uma
// depois dela na ordem do funil) — atendimento passou a ser humano.
export function agentShouldStayQuiet(agent, contactStage) {
  if (!agent?.stopAtStage || !contactStage) return false;
  return contactStage.order >= agent.stopAtStage.order;
}

// Monta a lista de "tools" (function calling) que esse agente pode usar,
// conforme as funções habilitadas nele. undefined = nenhuma função ligada.
function buildTools(agent) {
  const tools = [];
  if (agent.toolSendContact) {
    tools.push({
      type: "function",
      function: {
        name: "send_contact",
        description: "Envia o cartão de contato (vCard) configurado para este agente. Use quando o cliente pedir um contato, indicação ou número de outra pessoa/setor.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    });
  }
  if (agent.toolSendTemplate) {
    tools.push({
      type: "function",
      function: {
        name: "send_template",
        description: "Envia uma mensagem pronta cadastrada no sistema (pode ser texto, imagem, áudio pré-gravado ou documento) pelo título exato dela.",
        parameters: {
          type: "object",
          properties: { title: { type: "string", description: "Título exato da mensagem pronta a enviar" } },
          required: ["title"],
        },
      },
    });
  }
  if (agent.toolMoveStage) {
    tools.push({
      type: "function",
      function: {
        name: "move_stage",
        description: "Move o lead/cliente atual para outra etapa do funil (Kanban) pelo nome exato da etapa. Só pode mover até \"Análise\" (inclusive) — dali em diante o funil é controlado manualmente por um humano.",
        parameters: {
          type: "object",
          properties: { stage_name: { type: "string", description: "Nome exato da etapa de destino" } },
          required: ["stage_name"],
        },
      },
    });
  }
  return tools.length ? tools : undefined;
}

// Chama a DeepInfra (API compatível com OpenAI) para gerar a resposta do agente.
// Retorna { content, toolCalls } — content pode ser null se o modelo só chamou
// função(ões); toolCalls é um array (pode ser vazio) no formato do OpenAI.
export async function askIa(history, agent, apiKey, opts = {}) {
  if (!agent || !apiKey) return null;

  const model = agent.textModel || "meta-llama/Meta-Llama-3.1-8B-Instruct";
  const messages = [];
  if (agent.prompt) messages.push({ role: "system", content: agent.prompt });
  messages.push(...history);
  const tools = opts.noTools ? undefined : buildTools(agent);

  try {
    const body = { model, messages, temperature: 0.6, max_tokens: 400 };
    if (tools) body.tools = tools;
    const res = await fetch("https://api.deepinfra.com/v1/openai/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("[IA texto] falhou:", res.status, JSON.stringify(data).slice(0, 300));
      return null;
    }
    const msg = data?.choices?.[0]?.message;
    if (!msg) return null;
    return { content: msg.content?.trim() || null, toolCalls: msg.tool_calls || [] };
  } catch (err) {
    console.error("[IA texto] erro:", err.message);
    return null;
  }
}

// Executa as funções que a IA decidiu chamar. Retorna um resumo do que foi
// feito (usado só pra log — as próprias funções já mandam mensagem ao cliente
// quando fizer sentido, como enviar contato/template).
// Rede de segurança: a IA às vezes aceita a palavra do cliente ("enviado")
// sem nunca ter recebido um arquivo de verdade. Exige um mínimo de
// imagens/documentos reais recebidos nesta conversa antes de liberar o
// contato do cobrador — não prova que são os documentos certos, mas barra
// o caso claro de "não anexou nada".
export async function hasReceivedRealDocuments(contactId, minCount = 3) {
  const count = await prisma.message.count({
    where: { contactId, fromMe: false, kind: { in: ["image", "document"] } },
  });
  return count >= minCount;
}

// Rede de segurança: a IA às vezes libera o cobrador (ou move pra "Liberação
// pagamento") logo depois dos documentos iniciais, sem esperar o vídeo de
// compromisso e a localização em tempo real (pedidos juntos, no mesmo passo).
// Exige os dois terem chegado nesta conversa antes.
export async function hasReceivedVideoAndLocation(contactId) {
  const video = await prisma.message.findFirst({
    where: { contactId, fromMe: false, kind: "document", mimeType: { startsWith: "video/" } },
  });
  const location = await prisma.message.findFirst({ where: { contactId, fromMe: false, kind: "location" } });
  return Boolean(video && location);
}

export async function executeToolCalls(toolCalls, contact, agent, instance) {
  const { sendWhatsappContact, normalizeBrPhone } = await import("@/lib/evolution");
  const results = [];

  for (const call of toolCalls || []) {
    const name = call?.function?.name;
    let args = {};
    try { args = JSON.parse(call.function.arguments || "{}"); } catch { /* args inválidos, segue vazio */ }

    try {
      if (name === "send_contact" && agent.toolSendContact) {
        // Evita duplicar: modelos às vezes chamam a mesma função 2x na mesma resposta.
        const already = await prisma.message.findFirst({ where: { contactId: contact.id, kind: "contact" } });
        if (already) {
          results.push({ id: call.id, name, ok: true, note: "já enviado antes, não repetiu" });
          continue;
        }
        if (!(await hasReceivedRealDocuments(contact.id))) {
          results.push({
            id: call.id, name, ok: false,
            error: "Não pode enviar o contato do cobrador ainda: o cliente não anexou nenhum documento de verdade nesta conversa (só texto). Peça pra reenviar os documentos como arquivo/foto de verdade antes de prosseguir.",
          });
          continue;
        }
        if (!(await hasReceivedVideoAndLocation(contact.id))) {
          results.push({
            id: call.id, name, ok: false,
            error: "Não pode enviar o contato do cobrador ainda: ainda falta o vídeo de compromisso e/ou a localização em tempo real do cliente. Peça esses itens antes de prosseguir.",
          });
          continue;
        }
        const normalizedAgentPhone = normalizeBrPhone(agent.toolContactPhone);
        if (!agent.toolContactName || !normalizedAgentPhone) {
          results.push({ id: call.id, name, error: "Contato não configurado no agente" });
          continue;
        }
        const result = await sendWhatsappContact(
          contact.phone,
          { name: agent.toolContactName, contactPhone: normalizedAgentPhone },
          instance
        );
        await prisma.message.create({
          data: {
            contactId: contact.id,
            body: `Contato: ${agent.toolContactName} (${normalizedAgentPhone})`,
            kind: "contact",
            fromMe: true,
            status: result.simulated ? "simulado" : "enviado",
            instance,
          },
        });
        // O envio do contato do cobrador É o gatilho de "Análise" — não depende
        // da IA lembrar de chamar move_stage numa segunda função separada.
        await moveContactStage(contact.id, "Análise", instance).catch(() => {});
        results.push({ id: call.id, name, ok: true });
      } else if (name === "send_template" && agent.toolSendTemplate) {
        // Idem: se o template é do tipo contato e já mandamos um contato nessa
        // conversa, não repete (evita duplicar o cartão do cobrador).
        const tplPreview = await prisma.messageTemplate.findFirst({ where: { title: { equals: args.title } } });
        if (tplPreview?.mediaType === "contact") {
          const already = await prisma.message.findFirst({ where: { contactId: contact.id, kind: "contact" } });
          if (already) {
            results.push({ id: call.id, name, ok: true, title: args.title, note: "já enviado antes, não repetiu" });
            continue;
          }
          if (!(await hasReceivedRealDocuments(contact.id))) {
            results.push({
              id: call.id, name, ok: false, title: args.title,
              error: "Não pode enviar o contato do cobrador ainda: o cliente não anexou nenhum documento de verdade nesta conversa (só texto). Peça pra reenviar os documentos como arquivo/foto de verdade antes de prosseguir.",
            });
            continue;
          }
          if (!(await hasReceivedVideoAndLocation(contact.id))) {
            results.push({
              id: call.id, name, ok: false, title: args.title,
              error: "Não pode enviar o contato do cobrador ainda: ainda falta o vídeo de compromisso e/ou a localização em tempo real do cliente. Peça esses itens antes de prosseguir.",
            });
            continue;
          }
        }
        const ok = await sendTemplateByTitle(args.title, contact, instance);
        // O envio do contato do cobrador É o gatilho de "Análise" — não depende
        // da IA lembrar de chamar move_stage numa segunda função separada.
        if (ok && tplPreview?.mediaType === "contact") {
          await moveContactStage(contact.id, "Análise", instance).catch(() => {});
        }
        results.push({ id: call.id, name, ok, title: args.title });
      } else if (name === "move_stage" && agent.toolMoveStage) {
        const allStages = await prisma.stage.findMany();
        const targetStage = allStages.find((s) => normalizeStageName(s.name) === normalizeStageName(args.stage_name));
        const analiseStage = allStages.find((s) => normalizeStageName(s.name) === "analise");

        // A IA só decide o funil até "Análise" (inclusive) — dali em diante
        // (Liberação pagamento, Recebimento, Cravo, Venda perdida...) é
        // decisão humana, feita manualmente no Kanban.
        if (targetStage && analiseStage && targetStage.order > analiseStage.order) {
          results.push({
            id: call.id, name, ok: false,
            error: `Não mude para "${targetStage.name}": a partir de "Análise" o funil passa a ser controlado manualmente por um humano. Continue o atendimento normalmente sem mudar a etapa.`,
          });
          continue;
        }

        // "Análise" agora é disparado automaticamente pelo sistema no momento
        // em que o contato do cobrador é enviado de verdade (ver send_contact/
        // send_template acima) — não é mais uma etapa que a IA escolhe sozinha
        // (ela às vezes confirmava "interesse" do cliente e já movia pra lá
        // sem nenhum documento ter chegado). Chamada manual pra "Análise" só é
        // aceita se o contato do cobrador já tiver sido enviado nesta conversa.
        if (normalizeStageName(args.stage_name).includes("analise")) {
          const hasContact = await prisma.message.findFirst({ where: { contactId: contact.id, kind: "contact" } });
          if (!hasContact) {
            results.push({
              id: call.id, name, ok: false,
              error: "Não mude para \"Análise\" manualmente — essa etapa muda sozinha assim que você enviar o contato do cobrador (send_template). Continue o atendimento normalmente.",
            });
            continue;
          }
        }
        const ok = await moveContactStage(contact.id, args.stage_name, instance);
        results.push({ id: call.id, name, ok, stage: args.stage_name });
      } else {
        results.push({ id: call.id, name, error: "Função não habilitada" });
      }
    } catch (err) {
      results.push({ id: call.id, name, error: err.message });
    }
  }
  return results;
}

async function sendTemplateByTitle(title, contact, instance) {
  if (!title) return false;
  const tpl = await prisma.messageTemplate.findFirst({ where: { title: { equals: title } } });
  if (!tpl) return false;

  const { sendWhatsappText, sendWhatsappMedia, sendWhatsappAudio, sendWhatsappContact, normalizeBrPhone } = await import("@/lib/evolution");
  const { readMediaAsBase64 } = await import("@/lib/mediaStorage");
  const { interpolarVariaveis } = await import("@/lib/variaveis");
  const bodyFinal = interpolarVariaveis(tpl.body, contact);
  let result;
  let kind = "text";
  if (tpl.mediaType === "contact") {
    // Nunca manda o cartão do cobrador sem um telefone válido/salvável — sem
    // isso o contato chega no WhatsApp do cliente sem número pra salvar.
    const normalizedPhone = normalizeBrPhone(tpl.contactPhone);
    if (!tpl.contactName || !normalizedPhone) {
      console.error(`[sendTemplateByTitle] template "${title}" com contactName/contactPhone inválido — envio bloqueado.`);
      return false;
    }
    result = await sendWhatsappContact(contact.phone, { name: tpl.contactName, contactPhone: normalizedPhone }, instance);
    kind = "contact";
  } else if (tpl.mediaType === "audio") {
    result = await sendWhatsappAudio(contact.phone, await readMediaAsBase64(tpl.mediaUrl), instance);
    kind = "audio";
  } else if (tpl.mediaType === "image" || tpl.mediaType === "document") {
    result = await sendWhatsappMedia(contact.phone, {
      base64: await readMediaAsBase64(tpl.mediaUrl), mimetype: tpl.mediaMimetype, fileName: tpl.mediaFileName,
      caption: bodyFinal, mediatype: tpl.mediaType,
    }, instance);
    kind = tpl.mediaType;
  } else {
    result = await sendWhatsappText(contact.phone, bodyFinal, instance);
  }
  if (!result.ok) return false;

  // Guarda só o caminho do arquivo (reaproveita o mesmo /uploads/... do
  // template) em vez de duplicar o base64 inteiro numa mensagem nova a cada
  // envio — é o que fazia o banco crescer sem parar.
  await prisma.message.create({
    data: {
      contactId: contact.id,
      body: tpl.mediaType === "contact" ? `Contato: ${tpl.contactName} (${tpl.contactPhone})` : bodyFinal,
      kind,
      mediaUrl: tpl.mediaType !== "contact" ? tpl.mediaUrl : null,
      mimeType: tpl.mediaMimetype || null,
      fileName: tpl.mediaFileName || null,
      fromMe: true,
      status: result.simulated ? "simulado" : "enviado",
      instance,
    },
  });
  return true;
}

// Rede de segurança: manda o contato do cobrador sozinho quando a IA esqueceu
// de chamar send_template. Só age com segurança quando há exatamente 1
// template do tipo "contato" cadastrado — com vários estados, quem escolhe
// certo é a IA (aqui não temos como saber a região sem repetir a lógica dela).
export async function autoSendCobradorContact(contact, instance) {
  const contatos = await prisma.messageTemplate.findMany({ where: { mediaType: "contact" } });
  if (contatos.length === 0) return false;
  // Resolve pelo estado do DDD (mesma lógica usada no contexto da IA) —
  // com só 1 cadastrado, manda ele direto; com vários, precisa bater o estado.
  if (contatos.length === 1) return sendTemplateByTitle(contatos[0].title, contact, instance);
  const uf = ufFromPhone(contact.phone);
  const tpl = uf && contatos.find((t) => t.title.trim().toUpperCase() === `COBRADOR ${uf}`);
  if (!tpl) return false;
  return sendTemplateByTitle(tpl.title, contact, instance);
}

export async function moveContactStage(contactId, stageName, instance) {
  if (!stageName) return false;
  // Match normalizado (minúsculas, sem acento) — a IA às vezes manda o nome da
  // etapa com casing/acentuação diferente do cadastrado, e o `equals` exato
  // falhava em silêncio nesses casos (lead ficava travado na etapa errada).
  const stages = await prisma.stage.findMany();
  const target = normalizeStageName(stageName);
  const stage = stages.find((s) => normalizeStageName(s.name) === target);
  if (!stage) {
    console.error(`[IA move_stage] etapa não encontrada: "${stageName}"`);
    return false;
  }
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  const jaEstavaNaEtapa = contact?.stageId === stage.id;
  const last = await prisma.contact.findFirst({ where: { stageId: stage.id }, orderBy: { order: "desc" } });
  const data = { stageId: stage.id, order: (last?.order ?? -1) + 1 };
  // Ao entrar em "Análise", já preenche o valor do capital com o limite inicial
  // padrão (R$300) — evita ter que preencher manualmente depois.
  if (stage.name === "Análise") data.valorCapital = 300;
  // Ao entrar em "Cravo" (perda/inadimplência), a IA para automaticamente —
  // esse lead passa a ser tratado manualmente.
  if (stage.name === "Cravo" && !jaEstavaNaEtapa) data.iaPausada = true;
  if (stage.name === "Recebimento" && !jaEstavaNaEtapa && !contact?.entrouRecebimentoEm) {
    data.entrouRecebimentoEm = new Date();
  }
  await prisma.contact.update({ where: { id: contactId }, data });
  if (stage.name === "Recebimento" && !jaEstavaNaEtapa && contact) {
    await sendRecebimentoNotice(contact, instance).catch(() => {});
    const { lancarLiberacaoCapital } = await import("@/lib/cobranca");
    await lancarLiberacaoCapital({ ...contact, ...data }).catch(() => {});
  }
  return true;
}

// Mensagem fixa (não gerada pela IA, para garantir confiabilidade) enviada
// sempre que um lead entra na etapa "Recebimento", avisando que o cobrador
// da região assumiu a cobrança a partir do dia seguinte.
export async function sendRecebimentoNotice(contact, instanceHint) {
  const { sendWhatsappText, resolveInstanceForContact } = await import("@/lib/evolution");
  const text = "Olá o valor foi enviado, passamos o empréstimo para o cobrador da sua região, a partir de agora ele é o responsável do recebimento e começa a receber a partir de amanhã!";
  // Esse aviso tem que sair sempre pelo número de Vendas (o que atende a IA
  // comercial) — nunca pelo número de cobrança, mesmo que tenha sido o último
  // usado na conversa (ex.: cliente falou com o cobrador antes de receber o
  // valor). O número de Vendas é o único com um agente de IA atribuído.
  const numeroVendas = await prisma.whatsappNumber.findFirst({ where: { agentId: { not: null } } });
  const instance = numeroVendas?.instance || instanceHint || (await resolveInstanceForContact(contact.id));
  const result = await sendWhatsappText(contact.phone, text, instance);
  if (!result.ok) return false;
  await prisma.message.create({
    data: {
      contactId: contact.id,
      body: text,
      kind: "text",
      fromMe: true,
      status: result.simulated ? "simulado" : "enviado",
      instance,
    },
  });
  return true;
}

// Converte texto em áudio (TTS). O provedor é escolhido por agente
// (agent.ttsProvider: "deepinfra" | "fishaudio" | "elevenlabs").
// `cfg` é o Config completo (tem os 3 tokens possíveis).
// Retorna { base64, mimetype } ou null se não configurado/falhar.
export async function synthesizeSpeech(text, agent, cfg) {
  if (!agent || !text?.trim()) return null;
  const provider = agent.ttsProvider || "deepinfra";
  if (provider === "fishaudio") return synthesizeFishAudio(text, agent, cfg?.fishAudioApiKey);
  if (provider === "elevenlabs") return synthesizeElevenLabs(text, agent, cfg?.elevenLabsApiKey);
  return synthesizeDeepInfra(text, agent, cfg?.deepinfraApiKey);
}

async function synthesizeDeepInfra(text, agent, apiKey) {
  if (!apiKey) return null;
  const model = agent?.ttsModel || "ResembleAI/chatterbox-turbo";
  try {
    const body = { text };
    // A voz por nome (af_bella etc.) só existe no Kokoro — outros modelos ignoram/erram com isso.
    if (agent?.ttsVoice && model === "hexgrad/Kokoro-82M") body.voice = agent.ttsVoice;
    const res = await fetch(`https://api.deepinfra.com/v1/inference/${model}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.audio) {
      if (!res.ok) console.error("[TTS DeepInfra] falhou:", res.status, JSON.stringify(data).slice(0, 300));
      return null;
    }
    // audio vem como "data:audio/wav;base64,XXXX"
    const match = /^data:([^;]+);base64,(.+)$/s.exec(data.audio);
    if (!match) return null;
    return { mimetype: match[1], base64: match[2] };
  } catch (err) {
    console.error("[TTS DeepInfra] erro:", err.message);
    return null;
  }
}

// Fish Audio: https://api.fish.audio/v1/tts — devolve os bytes do áudio direto (não JSON).
async function synthesizeFishAudio(text, agent, apiKey) {
  if (!apiKey) return null;
  try {
    const body = { text, format: "wav" };
    if (agent?.ttsVoice) body.reference_id = agent.ttsVoice;
    const res = await fetch("https://api.fish.audio/v1/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error("[TTS Fish Audio] falhou:", res.status, errBody.slice(0, 300));
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) return null;
    return { mimetype: "audio/wav", base64: buf.toString("base64") };
  } catch (err) {
    console.error("[TTS Fish Audio] erro:", err.message);
    return null;
  }
}

// ElevenLabs: https://api.elevenlabs.io/v1/text-to-speech/{voice_id} — devolve os bytes do áudio direto.
async function synthesizeElevenLabs(text, agent, apiKey) {
  if (!apiKey || !agent?.ttsVoice) return null; // voice_id é obrigatório aqui
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${agent.ttsVoice}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "xi-api-key": apiKey },
      body: JSON.stringify({ text, model_id: "eleven_multilingual_v2" }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error("[TTS ElevenLabs] falhou:", res.status, errBody.slice(0, 300));
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) return null;
    return { mimetype: "audio/mpeg", base64: buf.toString("base64") };
  } catch (err) {
    console.error("[TTS ElevenLabs] erro:", err.message);
    return null;
  }
}

// Transcreve um áudio recebido (base64) usando Whisper na DeepInfra, pra IA
// conseguir "entender" o que o cliente falou. Retorna o texto ou null se falhar.
export async function transcribeAudio(base64, mimetype, apiKey) {
  if (!apiKey || !base64) return null;

  try {
    const bytes = Buffer.from(base64, "base64");
    const blob = new Blob([bytes], { type: mimetype || "audio/ogg" });
    const form = new FormData();
    form.append("audio", blob, "audio.ogg");

    const res = await fetch("https://api.deepinfra.com/v1/inference/openai/whisper-large-v3-turbo", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return null;
    return data?.text?.trim() || null;
  } catch {
    return null;
  }
}

// true se o texto parece uma lista/checklist (várias linhas com ✅, número
// ou marcador) — nesses casos manda o texto além do áudio, pra não obrigar
// o cliente a decorar uma lista só de ouvido.
function isListLike(text) {
  const lines = (text || "").split("\n");
  const listLines = lines.filter((l) => /^\s*(✅|[-*•]|\d+[.)])\s/.test(l));
  return listLines.length >= 2;
}

// Gera e envia a resposta da IA usando o histórico recente da conversa.
// - Só roda se o número (instância) que recebeu a mensagem tiver um agente atribuído.
// - Se a mensagem recebida for um áudio, transcreve (Whisper) pra IA entender.
// - O formato da resposta (texto ou áudio) segue o modo do agente:
//   "espelho" (acompanha o que o cliente mandou), "texto" ou "audio" (sempre).
export async function respondWithIa(contact, incomingMsg, instance, incomingAudio) {
  // Atendimento manual: humano assumiu essa conversa, a IA fica calada até
  // ser religada de novo (botão no chat/popup do lead).
  if (contact.iaPausada) return;

  const { sendWhatsappText, sendWhatsappAudio, sendPresence, onlyDigits } = await import("@/lib/evolution");
  const { readMediaAsBase64, saveMediaBase64 } = await import("@/lib/mediaStorage");

  const cfg = await getIaConfig();
  if (!cfg?.deepinfraApiKey) return;

  // Cada número escolhe seu próprio agente — sem agente atribuído, sem resposta.
  const agent = await getAgentForInstance(instance);
  if (!agent) return;
  const apiKey = cfg.deepinfraApiKey;

  // A partir da etapa configurada (ex.: "Liberação pagamento"), o atendimento
  // vira 100% humano — a IA para de responder esse lead.
  const currentStage = await prisma.stage.findUnique({ where: { id: contact.stageId } });
  if (agentShouldStayQuiet(agent, currentStage)) return;

  let userText = incomingMsg.body || "";
  const incomingWasAudio = incomingMsg.kind === "audio";

  // Transcreve o áudio recebido (se houver) pra IA saber o que o cliente falou
  if (incomingWasAudio && incomingAudio) {
    const transcript = await transcribeAudio(incomingAudio.base64, incomingAudio.mimetype, apiKey);
    if (!transcript) return; // não deu pra entender o áudio — não responde às cegas
    userText = transcript;
    // guarda a transcrição no histórico (aparece como legenda do áudio no chat)
    await prisma.message.update({ where: { id: incomingMsg.id }, data: { body: transcript } });
  }

  // Enquanto o lead não tem estado identificado, tenta descobrir pelo que ele
  // conta na conversa (modelo barato, não bloqueia a resposta principal).
  if (!contact.estado && userText.trim()) {
    detectarEstadoConversa(userText, apiKey)
      .then((uf) => {
        if (uf) return prisma.contact.update({ where: { id: contact.id }, data: { estado: uf } });
      })
      .catch(() => {});
  }

  // Documento/imagem recebido: analisa com modelo de visão pra IA saber se o
  // arquivo parece o documento certo e legível, antes de decidir a resposta.
  const isImageDoc =
    incomingMsg.kind === "image" ||
    (incomingMsg.kind === "document" && (incomingMsg.mimeType || "").startsWith("image/"));
  let docAnalysis = null;
  let docBase64 = null;
  if (isImageDoc && incomingMsg.mediaUrl) {
    docBase64 = await readMediaAsBase64(incomingMsg.mediaUrl);
    if (docBase64) docAnalysis = await analyzeDocumentImage(docBase64, incomingMsg.mimeType, incomingMsg.body, apiKey).catch(() => null);
  }

  // Nome do lead ainda é só o telefone/pushName do WhatsApp (placeholder)?
  // Se o documento revelou o nome completo de verdade, atualiza o cadastro
  // sozinho — evita ficar com uma lista de leads só com número de telefone.
  if (docAnalysis) {
    const nomeMatch = docAnalysis.match(/NOME_DETECTADO:\s*(.+)/i);
    const nomeDetectado = nomeMatch?.[1]?.trim();
    const nomeAtualPareceGenerico = /^[\d\s()+-]+$/.test((contact.name || "").trim()) || !contact.name?.trim();
    if (nomeDetectado && nomeDetectado.toLowerCase() !== "nenhum" && nomeDetectado.length >= 4 && nomeAtualPareceGenerico) {
      await prisma.contact.update({ where: { id: contact.id }, data: { name: nomeDetectado } }).catch(() => {});
      contact.name = nomeDetectado;
    }
  }

  // Gênero pelo documento (campo "Sexo" do RG/CNH ou pela foto) — mais
  // confiável que só o nome, então roda e pode corrigir o que veio de lá.
  // Não bloqueia a resposta principal.
  if (docBase64) {
    detectarGeneroPorDocumento(docBase64, incomingMsg.mimeType, apiKey)
      .then((g) => {
        if (g) return prisma.contact.update({ where: { id: contact.id }, data: { genero: g } });
      })
      .catch(() => {});
  }

  // Documento sem legenda (ex.: CNH em PDF, contrato de locação) não tem texto
  // nem análise de visão (essa só roda pra imagem) — mas ainda é um anexo de
  // verdade, então a IA precisa responder mesmo assim (confirmar recebimento e
  // pedir o próximo item). Só corta se não veio NADA de verdade (nem texto,
  // nem mídia, nem localização).
  const hasMedia = ["image", "document", "location"].includes(incomingMsg.kind);
  if (!userText.trim() && !docAnalysis && !hasMedia) return;

  // Mostra "digitando…" pro cliente enquanto a IA processa — modelos maiores (70B)
  // podem levar dezenas de segundos, isso evita parecer que travou.
  sendPresence(contact.phone, instance).catch(() => {});

  const recentMessages = await prisma.message.findMany({
    where: { contactId: contact.id, id: { not: incomingMsg.id } },
    orderBy: { createdAt: "desc" },
    take: 12,
  });
  const history = recentMessages
    .reverse()
    .map((m) => ({ role: m.fromMe ? "assistant" : "user", content: m.body || "" }))
    .filter((m) => m.content.trim());

  // Dá pra IA o telefone/DDD do lead atual, o estado já resolvido pelo DDD
  // (não deixa a IA "adivinhar"/inventar) e qual template de contato exato
  // usar — calculado aqui, não fixo no prompt, pra nunca ficar desatualizado
  // quando um novo estado for cadastrado.
  const digits = onlyDigits(contact.phone || "");
  const ddd = digits.startsWith("55") ? digits.slice(2, 4) : digits.slice(0, 2);
  const ufDoCliente = ufFromPhone(contact.phone);
  if (ddd) {
    let infoCobrador;
    if (ufDoCliente) {
      const contatosCadastrados = await prisma.messageTemplate.findMany({ where: { mediaType: "contact" } });
      const tplDoEstado = contatosCadastrados.find(
        (t) => t.title.trim().toUpperCase() === `COBRADOR ${ufDoCliente}`
      );
      infoCobrador = tplDoEstado
        ? `Estado do cliente: ${ufDoCliente}. Já existe cobrador cadastrado pra esse estado — quando for enviar o contato, use send_template com o título EXATO "${tplDoEstado.title}".`
        : `Estado do cliente: ${ufDoCliente}. NÃO existe cobrador cadastrado pra esse estado ainda — avise o cliente que vai encaminhar pra verificação manual e NÃO tente enviar nenhum contato nem invente um título de template.`;
    } else {
      infoCobrador = "Não foi possível identificar o estado do cliente pelo DDD — avise que vai encaminhar pra verificação manual.";
    }
    history.unshift({
      role: "system",
      content: `Dados do lead atual nesta conversa: telefone ${contact.phone}, DDD ${ddd}. ${infoCobrador}`,
    });
  }

  // A janela de histórico acima é só das últimas 12 mensagens — numa conversa
  // longa, documentos/vídeo/localização enviados antes disso somem da vista da
  // IA, que então repete o pedido do zero. Dá pra ela a contagem real (a
  // conversa inteira), pra nunca reenviar um pedido do que já foi recebido.
  const [qtdImagens, qtdDocumentos, temLocalizacao] = await Promise.all([
    prisma.message.count({ where: { contactId: contact.id, fromMe: false, kind: "image" } }),
    prisma.message.count({ where: { contactId: contact.id, fromMe: false, kind: "document" } }),
    prisma.message.findFirst({ where: { contactId: contact.id, fromMe: false, kind: "location" } }),
  ]);
  if (qtdImagens + qtdDocumentos > 0) {
    history.unshift({
      role: "system",
      content:
        `Nesta conversa (contando desde o início, não só as últimas mensagens abaixo) o cliente já enviou ` +
        `${qtdImagens} imagem(ns) e ${qtdDocumentos} documento(s)${temLocalizacao ? ", e já compartilhou localização em tempo real" : ""}. ` +
        `NÃO peça pra reenviar documentação/foto/vídeo que já foi recebida — confirme o que já chegou e siga pro próximo passo do fluxo. ` +
        `Só peça de novo se a análise do arquivo mais recente (quando houver, abaixo) indicar que ele está incorreto, ilegível ou incompleto.`,
    });
  }

  history.push({ role: "user", content: userText || "[Enviou uma imagem/documento]" });
  if (docAnalysis) {
    history.push({
      role: "system",
      content:
        `Análise automática do arquivo que o cliente acabou de enviar: ${docAnalysis}\n` +
        `Se a análise indicar que o documento está errado, ilegível ou incompleto, avise o cliente e peça pra reenviar corretamente. Se estiver ok, siga o fluxo normalmente.`,
    });
  }

  // Loop de function calling: a IA pode chamar uma função, ver o resultado e
  // decidir chamar outra (ex.: enviar o contato do cobrador E mudar a etapa)
  // antes de dar a resposta final em texto. Limite de rodadas evita loop infinito.
  let reply = null;
  let anyToolRan = false;
  const messages = history;
  for (let round = 0; round < 5; round++) {
    const result_ia = await askIa(messages, agent, apiKey);
    if (!result_ia) return;

    if (!result_ia.toolCalls?.length) {
      reply = result_ia.content;
      break;
    }
    anyToolRan = true;

    const toolResults = await executeToolCalls(result_ia.toolCalls, contact, agent, instance).catch((err) => {
      console.error("[IA function calling] erro ao executar:", err.message);
      return [];
    });

    // Alimenta a próxima rodada com o que foi chamado + o resultado, no formato OpenAI
    messages.push({
      role: "assistant",
      content: result_ia.content || null,
      tool_calls: result_ia.toolCalls,
    });
    for (const call of result_ia.toolCalls) {
      const res = toolResults.find((r) => r.id === call.id) || { ok: false };
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(res) });
    }

    if (result_ia.content) {
      reply = result_ia.content;
      break;
    }
    // sem conteúdo ainda — deixa rodar mais uma vez pra ver se a IA quer chamar outra função
  }

  // O loop esgotou as rodadas chamando função atrás de função sem nunca dar uma
  // resposta em texto — força mais uma chamada SEM ferramentas, só pra garantir
  // que o cliente recebe alguma confirmação (nunca fica em silêncio total).
  if (!reply && anyToolRan) {
    messages.push({ role: "user", content: "(Confirme rapidamente o que foi feito, em uma mensagem curta.)" });
    const finalTry = await askIa(messages, agent, apiKey, { noTools: true });
    reply = finalTry?.content || null;
  }

  if (!reply) return; // não chamou função nenhuma e não sobrou texto pra responder — encerra aqui

  // A IA está de fato prestes a mandar a primeira resposta pro lead — marca
  // que o atendimento começou. Busca o estágio ATUAL de novo (não reaproveita
  // `currentStage` do topo da função) porque esta mesma requisição do webhook
  // pode já ter movido o lead antes de chamar respondWithIa — ex.: primeira
  // mensagem do cliente já vier com documento e mover pra "Documentação"
  // primeiro; sem isso essa etapa avançada seria revertida pra "Em conversa".
  const freshContact = await prisma.contact.findUnique({ where: { id: contact.id }, include: { stage: true } });
  const emConversa = await prisma.stage.findFirst({ where: { name: "Em conversa" } });
  if (emConversa && freshContact?.stage && freshContact.stage.order < emConversa.order) {
    await moveContactStage(contact.id, "Em conversa", instance).catch(() => {});
  }

  // Rede de segurança: a IA às vezes CONFIRMA em texto que os documentos estão
  // corretos/aprovados mesmo sem ter recebido nenhum arquivo real na conversa
  // (o cliente só disse "enviado" por texto). Troca a resposta por um aviso
  // pedindo o anexo de verdade, em vez de deixar a confirmação falsa passar.
  const pareceConfirmarDocumentos = /aprovad|confirm\w*\s+(a\s+)?documenta[cç][ãa]o|documenta[cç][ãa]o\s+(est[áa]\s+)?(completa|correta|em ordem|certa|confirmada)/i.test(reply);
  if (pareceConfirmarDocumentos && !(await hasReceivedRealDocuments(contact.id))) {
    reply = "Ainda não recebi nenhum documento de verdade nesta conversa — preciso que você anexe os documentos como foto ou arquivo (não só escrever que enviou) pra eu poder confirmar e continuar.";
  }

  // Rede de segurança extra: se a resposta MENCIONA o cobrador (ex.: a mensagem
  // fixa de handoff) mas a função de enviar contato nunca rodou de verdade
  // nessa conversa, manda o contato agora — a IA às vezes só narra essa frase
  // sem chamar a função, mesmo depois de perguntada diretamente sobre o contato.
  if (/cobrador/i.test(reply)) {
    const hasContact = await prisma.message.findFirst({ where: { contactId: contact.id, kind: "contact" } });
    if (!hasContact && (await hasReceivedRealDocuments(contact.id)) && (await hasReceivedVideoAndLocation(contact.id))) {
      await autoSendCobradorContact(contact, instance).catch(() => {});
    }
  }

  const modo = agent.modoResposta || "espelho";
  const responderPorAudio = modo === "audio" || (modo === "espelho" && incomingWasAudio);

  if (responderPorAudio) {
    const audio = await synthesizeSpeech(reply, agent, cfg);
    if (audio) {
      const result = await sendWhatsappAudio(contact.phone, audio.base64, instance);
      const mediaUrl = await saveMediaBase64(audio.base64, audio.mimetype, null);
      await prisma.message.create({
        data: {
          contactId: contact.id,
          body: reply,
          kind: "audio",
          mediaUrl,
          mimeType: audio.mimetype,
          fromMe: true,
          status: result.simulated ? "simulado" : "enviado",
          instance,
        },
      });
      // Listas/checklists (documentos, passos numerados etc.) são difíceis de
      // acompanhar só de ouvido — manda o texto também, mesmo no modo áudio.
      if (isListLike(reply)) {
        const textResult = await sendWhatsappText(contact.phone, reply, instance);
        await prisma.message.create({
          data: {
            contactId: contact.id,
            body: reply,
            fromMe: true,
            status: textResult.simulated ? "simulado" : "enviado",
            kind: "text",
            instance,
          },
        });
      }
      return;
    }
    // síntese falhou — segue pro fallback de texto abaixo
  }

  const result = await sendWhatsappText(contact.phone, reply, instance);
  await prisma.message.create({
    data: {
      contactId: contact.id,
      body: reply,
      fromMe: true,
      status: result.simulated ? "simulado" : "enviado",
      kind: "text",
      instance,
    },
  });
}
