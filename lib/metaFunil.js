// Regras PURAS do envio de "lead avançou de etapa" ao Meta (Conversions API for CRM).
// Sem banco e sem rede: tudo aqui é testado em tests/metaFunil.test.mjs.
import crypto from "crypto";

// O Meta recusa evento com mais de 7 dias. Margem de 1 hora para o relógio e o tempo de envio.
export const JANELA_MS = 7 * 24 * 3600e3 - 3600e3;

export const EVENTO_PADRAO = "LeadEmAnalise";
export const ETAPA_PADRAO = "Análise";

export function sha256(valor) {
  return crypto.createHash("sha256").update(String(valor)).digest("hex");
}

// Telefone: só dígitos, com DDI 55. Aceita 10/11 dígitos (DDD+número) ou 12/13 já com 55. Fora disso, inválido.
export function normalizarTelefone(bruto) {
  let d = String(bruto || "").replace(/\D/g, "");
  if (!d) return null;
  d = d.replace(/^0+/, "");
  if (d.length === 10 || d.length === 11) d = "55" + d;
  if (!/^55\d{10,11}$/.test(d)) return null;
  const ddd = Number(d.slice(2, 4));
  if (ddd < 11 || ddd > 99) return null;
  return d;
}

export function normalizarEmail(bruto) {
  const e = String(bruto || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

// Config: etapa que dispara e nome do evento (por empresa/funil). Cai no padrão se faltar.
export function eventoParaEtapa(etapaNova, cfg) {
  const alvo = norm(cfg?.etapa || ETAPA_PADRAO);
  if (!etapaNova || norm(etapaNova) !== alvo) return null;
  const nome = String(cfg?.evento || EVENTO_PADRAO).trim();
  return /^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(nome) ? nome : null;
}

export function eventId(contactId, evento) {
  return `${contactId}:${evento}`;
}

// Marca guardada na lead: JSON {"LeadEmAnalise":"2026-11-09T12:00:00.000Z"}.
export function lerMarcas(json) {
  try {
    const o = JSON.parse(json || "{}");
    return o && typeof o === "object" && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
}
export function jaEnviado(json, evento) {
  return !!lerMarcas(json)[evento];
}
export function marcarEnviado(json, evento, quando = new Date()) {
  return JSON.stringify({ ...lerMarcas(json), [evento]: new Date(quando).toISOString() });
}

export function dentroDaJanela(eventoEm, agora = new Date()) {
  const t = new Date(eventoEm).getTime();
  const a = new Date(agora).getTime();
  if (!Number.isFinite(t) || t > a + 60e3) return false;
  return a - t <= JANELA_MS;
}

// Decide o que fazer com UMA troca de etapa. Devolve { enviar, motivo, evento }.
export function decidir({ contact, paraEtapa, eventoEm, cfg, agora = new Date() }) {
  const evento = eventoParaEtapa(paraEtapa, cfg);
  if (!evento) return { enviar: false, motivo: "outra_etapa" };
  if (!contact || contact.excluidoEm) return { enviar: false, motivo: "lead_excluida", evento };
  if (jaEnviado(contact.metaEventos, evento)) return { enviar: false, motivo: "ja_enviada", evento };
  if (!dentroDaJanela(eventoEm, agora)) return { enviar: false, motivo: "mais_de_7_dias", evento };
  if (!normalizarTelefone(contact.phone) && !normalizarEmail(contact.emailApp)) return { enviar: false, motivo: "sem_contato", evento };
  return { enviar: true, motivo: "ok", evento };
}

// Corpo do evento. SÓ hash de telefone/e-mail + external_id (hash do id) + país. Sem nome, CPF, valor ou renda.
export function montarEvento({ contact, evento, eventoEm }) {
  const user_data = { external_id: [sha256(contact.id)], country: [sha256("br")] };
  const ph = normalizarTelefone(contact.phone);
  const em = normalizarEmail(contact.emailApp);
  if (ph) user_data.ph = [sha256(ph)];
  if (em) user_data.em = [sha256(em)];
  return {
    event_name: evento,
    event_time: Math.floor(new Date(eventoEm).getTime() / 1000),
    event_id: eventId(contact.id, evento),
    action_source: "system_generated",
    user_data,
    custom_data: { lead_event_source: "Controller", event_source: "crm" },
  };
}
