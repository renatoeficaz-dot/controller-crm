import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { processIncomingMessage, processMessageAck } from "@/lib/webhookCommon";
import { getWabaConfig, assinaturaValida, interpretarWebhookWaba, statusParaSistema, baixarMidiaWaba } from "@/lib/waba";

// Webhook da API oficial do WhatsApp (WABA / Cloud API).
// GET  = verificação do webhook no painel da Meta (hub.challenge).
// POST = mensagens recebidas, confirmações (enviada/entregue/lida) e — na coexistência — os "ecos"
//        das mensagens enviadas pelo app WhatsApp Business do celular (campo smb_message_echoes).
export async function GET(req) {
  const url = new URL(req.url);
  const modo = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const desafio = url.searchParams.get("hub.challenge");
  const cfg = await getWabaConfig();
  if (modo === "subscribe" && cfg.verifyToken && token === cfg.verifyToken) {
    return new NextResponse(desafio || "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return NextResponse.json({ error: "verificação recusada" }, { status: 403 });
}

export async function POST(req) {
  const bruto = await req.text();
  const cfg = await getWabaConfig();
  if (!assinaturaValida(bruto, req.headers.get("x-hub-signature-256"), cfg.appSecret)) {
    return NextResponse.json({ error: "assinatura inválida" }, { status: 401 });
  }
  let corpo = null;
  try { corpo = JSON.parse(bruto); } catch { return NextResponse.json({ ok: true }); }

  const { mensagens, statuses, outros } = interpretarWebhookWaba(corpo);

  for (const s of statuses) {
    const novo = statusParaSistema(s.status);
    if (novo) await processMessageAck(s.id, novo).catch(() => {});
    if (s.status === "failed") {
      // A Meta recusou o envio (ex.: fora da janela de 24h sem template): marca a mensagem como erro.
      await prisma.message.updateMany({ where: { waMessageId: s.id }, data: { status: "erro" } }).catch(() => {});
      console.error("[waba] envio falhou:", s.id, s.erro || "");
    }
  }

  for (const m of mensagens) {
    const numero = m.phoneNumberId
      ? await prisma.whatsappNumber.findFirst({ where: { provider: "waba", wabaPhoneNumberId: m.phoneNumberId } })
      : null;
    if (!numero) { console.error("[waba] mensagem para phone_number_id desconhecido:", m.phoneNumberId); continue; }
    const mediaId = m.media?.mediaId;
    await processIncomingMessage({
      instance: numero.instance,
      fromMe: m.fromMe,
      isGroup: false,
      number: m.number,
      numeroEhLid: false,
      pushName: m.pushName,
      text: m.text,
      media: m.media,
      location: m.location,
      contacts: m.contacts,
      downloadMedia: mediaId ? () => baixarMidiaWaba(mediaId, numero.wabaAccessToken) : null,
      waMessageId: m.waMessageId,
    }).catch((err) => console.error("[waba] falha ao processar mensagem:", err?.message || err));
  }

  // history / smb_app_state_sync / qualidade do número: por ora só registra (o histórico antigo não é importado).
  for (const o of outros) {
    if (o.field === "phone_number_quality_update" && o.phoneNumberId) {
      const q = o.value?.current_limit || o.value?.event || null;
      await prisma.whatsappNumber.updateMany({ where: { wabaPhoneNumberId: o.phoneNumberId }, data: { wabaQualidade: q ? String(q).slice(0, 40) : undefined } }).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true });
}
