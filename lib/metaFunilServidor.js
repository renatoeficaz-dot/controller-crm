// Envio ao Meta (Conversions API) quando a lead ENTRA na etapa configurada (padrão "Análise").
// Chamado pelo gancho em lib/prisma.js (EtapaLog.create) — ponto central de toda troca de etapa.
// Falha daqui NUNCA propaga para quem moveu a lead.
import { prisma } from "@/lib/prisma";
import { decifrar } from "@/lib/segredo";
import { decidir, montarEvento, marcarEnviado } from "@/lib/metaFunil";

const VERSAO = "v21.0";
const emVoo = new Set(); // contactId:evento em envio agora (evita corrida)

export async function lerConfigCapi() {
  const c = await prisma.config.findUnique({
    where: { id: "singleton" },
    select: { metaCapiAtivo: true, metaCapiDatasetId: true, metaCapiTokenEnc: true, metaCapiEtapa: true, metaCapiEvento: true, metaCapiTesteCodigo: true },
  });
  if (!c) return null;
  return { ativo: c.metaCapiAtivo, dataset: c.metaCapiDatasetId, token: decifrar(c.metaCapiTokenEnc), etapa: c.metaCapiEtapa, evento: c.metaCapiEvento, testeCodigo: c.metaCapiTesteCodigo };
}

async function postar(cfg, eventos) {
  const body = { data: eventos, access_token: cfg.token };
  if (cfg.testeCodigo) body.test_event_code = cfg.testeCodigo;
  const res = await fetch(`https://graph.facebook.com/${VERSAO}/${encodeURIComponent(cfg.dataset)}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Meta ${res.status}: ${String(json?.error?.message || "erro").slice(0, 200)}`); // nunca inclui o token
  return json;
}

// Envia UMA lead. Devolve { enviada, motivo }.
export async function enviarLeadAoMeta({ contactId, paraEtapa, eventoEm, cfg: cfgPronta, simular = false }) {
  const cfg = cfgPronta || (await lerConfigCapi());
  if (!cfg || (!simular && (!cfg.ativo || !cfg.dataset || !cfg.token))) return { enviada: false, motivo: "desligado" };
  const contact = await prisma.contact.findUnique({ where: { id: contactId }, select: { id: true, phone: true, emailApp: true, excluidoEm: true, metaEventos: true } });
  const d = decidir({ contact, paraEtapa, eventoEm, cfg });
  if (!d.enviar) return { enviada: false, motivo: d.motivo };
  if (simular) return { enviada: false, motivo: "ok_simulado", evento: d.evento };
  const chave = `${contactId}:${d.evento}`;
  if (emVoo.has(chave)) return { enviada: false, motivo: "ja_enviada" };
  emVoo.add(chave);
  try {
    await postar(cfg, [montarEvento({ contact, evento: d.evento, eventoEm })]);
    // Em modo teste (test_event_code) o evento não vale de verdade: não marca como enviado.
    if (!cfg.testeCodigo) {
      await prisma.contact.update({ where: { id: contactId }, data: { metaEventos: marcarEnviado(contact.metaEventos, d.evento) } });
    }
    return { enviada: true, motivo: cfg.testeCodigo ? "teste" : "ok", evento: d.evento };
  } catch (e) {
    console.error("[meta-capi] falha no envio:", e?.message);
    return { enviada: false, motivo: "erro", erro: e?.message };
  } finally {
    emVoo.delete(chave);
  }
}

// Chamado pelo gancho do EtapaLog. Espera 3 s (a transação que gravou o log já fechou) e nunca lança.
export function agendarEnvioPorEtapaLog(logs) {
  const lista = (Array.isArray(logs) ? logs : [logs]).filter((l) => l?.contactId && l?.paraEtapa);
  if (!lista.length) return;
  setTimeout(async () => {
    try {
      const cfg = await lerConfigCapi();
      if (!cfg?.ativo) return;
      for (const l of lista) await enviarLeadAoMeta({ contactId: l.contactId, paraEtapa: l.paraEtapa, eventoEm: l.createdAt || new Date(), cfg });
    } catch (e) {
      console.error("[meta-capi] gancho:", e?.message);
    }
  }, 3000).unref?.();
}
