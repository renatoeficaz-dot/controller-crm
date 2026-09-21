import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import crypto from "crypto";
import { normalizeBrPhone } from "@/lib/evolution";

// Integração com Meta Lead Ads (Facebook/Instagram — formulários instantâneos).
// Deixado pronto pro Renato conectar depois, do lado do Meta for Developers:
// 1) Criar um App lá, vincular à Página que roda os anúncios, pedir a
//    permissão leads_retrieval e gerar um token de acesso de Página.
// 2) Em Configurações → Meta Ads, colar App Secret / Page ID / Page Token —
//    a tela gera e mostra a URL de callback e o Verify Token que vão no
//    formulário de Webhooks do App (assinar o campo "leadgen" da Página).
// Sem isso tudo configurado lá, esta rota fica inerte (GET falha a
// verificação, POST não teria assinatura pra bater).

async function getConfig() {
  return prisma.config.findUnique({ where: { id: "singleton" } });
}

// Passo 1 do Meta: confirma que este endpoint é seu, ecoando o hub.challenge
// só se o hub.verify_token bater com o que está salvo em Config.
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const cfg = await getConfig();
  if (mode === "subscribe" && token && cfg?.metaAdsVerifyToken && token === cfg.metaAdsVerifyToken) {
    return new NextResponse(challenge || "", { status: 200 });
  }
  return NextResponse.json({ error: "Verify token inválido." }, { status: 403 });
}

// Confere a assinatura HMAC-SHA256 que o Meta manda em X-Hub-Signature-256,
// calculada com o App Secret sobre o corpo CRU (por isso lê req.text(), não
// req.json() — string reserializada não bate byte a byte com o original).
function assinaturaValida(corpoCru, header, appSecret) {
  if (!header || !appSecret) return false;
  const esperado = "sha256=" + crypto.createHmac("sha256", appSecret).update(corpoCru).digest("hex");
  const a = Buffer.from(header);
  const b = Buffer.from(esperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// O webhook só avisa "leadgen_id X aconteceu" — o conteúdo de verdade (nome,
// telefone, respostas) precisa ser buscado à parte na Graph API, com o token
// de Página.
async function buscarLead(leadgenId, pageToken) {
  const url = `https://graph.facebook.com/v19.0/${leadgenId}?access_token=${encodeURIComponent(pageToken)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Graph API respondeu ${res.status}`);
  return res.json();
}

// Os nomes dos campos vêm de como a pergunta foi configurada no formulário —
// full_name/first_name+last_name pro nome, phone_number pro telefone. Todo o
// resto (e-mail, perguntas customizadas que ainda nem existem) fica sem
// mapeamento fixo de propósito: entra em "notes" como pergunta/resposta pra
// não se perder, mesmo sem eu saber hoje quais perguntas o formulário vai ter.
function mapearCampos(fieldData) {
  const porNome = {};
  for (const f of fieldData || []) {
    const chave = (f.name || "").toLowerCase();
    const valor = (f.values || [])[0] || "";
    porNome[chave] = valor;
  }
  const nome =
    porNome.full_name ||
    [porNome.first_name, porNome.last_name].filter(Boolean).join(" ") ||
    null;
  const telefone = porNome.phone_number ? normalizeBrPhone(porNome.phone_number) : null;

  const conhecidos = new Set(["full_name", "first_name", "last_name", "phone_number"]);
  const extras = Object.entries(porNome)
    .filter(([k, v]) => !conhecidos.has(k) && v)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");

  return { nome, telefone, extras };
}

export async function POST(req) {
  const corpoCru = await req.text();
  const cfg = await getConfig();

  const header = req.headers.get("x-hub-signature-256");
  if (!assinaturaValida(corpoCru, header, cfg?.metaAdsAppSecret)) {
    return NextResponse.json({ error: "Assinatura inválida." }, { status: 401 });
  }
  if (!cfg?.metaAdsPageToken) {
    return NextResponse.json({ error: "Meta Ads não configurado (falta o token de Página)." }, { status: 400 });
  }

  const body = JSON.parse(corpoCru || "{}");
  const stagePrimeira = await prisma.stage.findFirst({ orderBy: { order: "asc" } });
  // Responsável inicial do lead = usuário dono do número escolhido em
  // Configurações → Meta Ads (mesmo campo que o resto do sistema usa pra
  // decidir quem enxerga o card — ver lib/contatoAcesso.js).
  const numero = cfg.metaAdsNumeroId
    ? await prisma.whatsappNumber.findUnique({ where: { id: cfg.metaAdsNumeroId }, include: { user: { select: { name: true } } } })
    : null;
  const responsavelPadrao = numero?.user?.name || null;

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== "leadgen") continue;
      const v = change.value || {};
      const leadgenId = String(v.leadgen_id || "");
      if (!leadgenId) continue;

      // Reenvio do mesmo webhook (o Meta faz isso) não deve criar um segundo card.
      const jaExiste = await prisma.contact.findUnique({ where: { metaLeadId: leadgenId } });
      if (jaExiste) continue;

      let lead;
      try {
        lead = await buscarLead(leadgenId, cfg.metaAdsPageToken);
      } catch {
        continue; // token expirado/inválido — sem isso não dá pra recuperar o lead; fica só o log do Meta
      }

      const { nome, telefone, extras } = mapearCampos(lead.field_data);
      if (!stagePrimeira) continue;

      // Mesmo telefone já é um contato (ex.: cliente antigo, ou já mandou
      // mensagem antes de preencher o formulário) — vincula nesse card em vez
      // de criar um duplicado. Compara pelos últimos 8 dígitos, igual ao
      // pré-cadastro por link (/api/formulario): DDI/DDD podem vir diferentes
      // entre o que o WhatsApp registrou e o que a Meta formatou.
      const existente = telefone
        ? await prisma.contact.findFirst({ where: { phone: { endsWith: telefone.slice(-8) }, excluidoEm: null } })
        : null;

      const notaMeta = [
        "Lead recebido via Meta Ads (formulário instantâneo).",
        extras ? `\nRespostas adicionais:\n${extras}` : "",
      ].join("");

      if (existente) {
        await prisma.contact.update({
          where: { id: existente.id },
          data: {
            metaLeadId: leadgenId,
            metaFormId: v.form_id ? String(v.form_id) : null,
            metaAdId: v.ad_id ? String(v.ad_id) : null,
            metaCampaignId: v.campaign_id ? String(v.campaign_id) : null,
            // Nunca sobrescreve nome/notas de quem já é um lead com histórico —
            // só anexa a nota do novo formulário ao que já existia.
            notes: [existente.notes, notaMeta].filter(Boolean).join("\n\n"),
          },
        });
        continue;
      }

      await prisma.contact.create({
        data: {
          name: nome || telefone || "Lead do Facebook/Instagram",
          phone: telefone,
          stageId: stagePrimeira.id,
          metaLeadId: leadgenId,
          metaFormId: v.form_id ? String(v.form_id) : null,
          metaAdId: v.ad_id ? String(v.ad_id) : null,
          metaCampaignId: v.campaign_id ? String(v.campaign_id) : null,
          responsavel: responsavelPadrao,
          notes: notaMeta,
        },
      });
    }
  }

  return NextResponse.json({ ok: true });
}
