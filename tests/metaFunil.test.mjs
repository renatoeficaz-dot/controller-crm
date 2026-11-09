// Regras puras do envio de avanço de etapa ao Meta (lib/metaFunil.js).
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { normalizarTelefone, normalizarEmail, eventoParaEtapa, eventId, jaEnviado, marcarEnviado, dentroDaJanela, decidir, montarEvento } from "../lib/metaFunil.js";

const h = (v) => crypto.createHash("sha256").update(v).digest("hex");
const agora = new Date("2026-11-09T12:00:00Z");
const cfg = { etapa: "Análise", evento: "LeadEmAnalise" };
const lead = { id: "c1", phone: "(19) 99285-2865", emailApp: null, excluidoEm: null, metaEventos: null };

test("telefone: DDI 55, só dígitos, inválidos recusados", () => {
  assert.equal(normalizarTelefone("(19) 99285-2865"), "5519992852865");
  assert.equal(normalizarTelefone("5519992852865"), "5519992852865");
  assert.equal(normalizarTelefone("+55 11 4016-6248"), "551140166248");
  assert.equal(normalizarTelefone("12345"), null);
  assert.equal(normalizarTelefone(""), null);
  assert.equal(normalizarTelefone("5501992852865"), null);
});

test("e-mail: minúsculas, inválido vira null", () => {
  assert.equal(normalizarEmail("  Fulano@Gmail.COM "), "fulano@gmail.com");
  assert.equal(normalizarEmail("sem-arroba"), null);
});

test("evento só para a etapa configurada (sem acento/caixa) e nome validado", () => {
  assert.equal(eventoParaEtapa("Análise", cfg), "LeadEmAnalise");
  assert.equal(eventoParaEtapa("analise", cfg), "LeadEmAnalise");
  assert.equal(eventoParaEtapa("Documentação", cfg), null);
  assert.equal(eventoParaEtapa("Análise", {}), "LeadEmAnalise");
  assert.equal(eventoParaEtapa("Triagem", { etapa: "Triagem", evento: "LeadTriado" }), "LeadTriado");
  assert.equal(eventoParaEtapa("Análise", { evento: "nome com espaço" }), null);
});

test("deduplicação: event_id e marca na lead", () => {
  assert.equal(eventId("c1", "LeadEmAnalise"), "c1:LeadEmAnalise");
  const m = marcarEnviado(null, "LeadEmAnalise", agora);
  assert.equal(jaEnviado(m, "LeadEmAnalise"), true);
  assert.equal(jaEnviado(m, "Outro"), false);
  assert.equal(jaEnviado("lixo{", "LeadEmAnalise"), false);
  assert.deepEqual(Object.keys(JSON.parse(marcarEnviado(m, "Outro", agora))).sort(), ["LeadEmAnalise", "Outro"]);
});

test("janela de 7 dias", () => {
  assert.equal(dentroDaJanela("2026-11-09T11:00:00Z", agora), true);
  assert.equal(dentroDaJanela("2026-11-03T00:00:00Z", agora), true);
  assert.equal(dentroDaJanela("2026-11-02T11:00:00Z", agora), false);
  assert.equal(dentroDaJanela("2026-11-02T12:30:00Z", agora), false); // 6d23h30: já dentro da margem de 1h
  assert.equal(dentroDaJanela("2026-11-10T12:00:00Z", agora), false); // futuro
});

test("decidir: ok, já enviada, antiga, sem contato, excluída, outra etapa", () => {
  const ev = "2026-11-09T11:00:00Z";
  assert.deepEqual(decidir({ contact: lead, paraEtapa: "Análise", eventoEm: ev, cfg, agora }), { enviar: true, motivo: "ok", evento: "LeadEmAnalise" });
  assert.equal(decidir({ contact: { ...lead, metaEventos: marcarEnviado(null, "LeadEmAnalise") }, paraEtapa: "Análise", eventoEm: ev, cfg, agora }).motivo, "ja_enviada");
  assert.equal(decidir({ contact: lead, paraEtapa: "Análise", eventoEm: "2026-10-01T00:00:00Z", cfg, agora }).motivo, "mais_de_7_dias");
  assert.equal(decidir({ contact: { ...lead, phone: "123" }, paraEtapa: "Análise", eventoEm: ev, cfg, agora }).motivo, "sem_contato");
  assert.equal(decidir({ contact: { ...lead, phone: "123", emailApp: "a@b.co" }, paraEtapa: "Análise", eventoEm: ev, cfg, agora }).enviar, true);
  assert.equal(decidir({ contact: { ...lead, excluidoEm: new Date() }, paraEtapa: "Análise", eventoEm: ev, cfg, agora }).motivo, "lead_excluida");
  assert.equal(decidir({ contact: lead, paraEtapa: "Pago", eventoEm: ev, cfg, agora }).motivo, "outra_etapa");
});

test("evento enviado: só hashes, sem dado financeiro nem nome", () => {
  const c = { ...lead, name: "Fulano da Silva", cpf: "12345678900", valorCapital: 500, emailApp: "F@x.com" };
  const e = montarEvento({ contact: c, evento: "LeadEmAnalise", eventoEm: "2026-11-09T11:00:00Z" });
  assert.equal(e.action_source, "system_generated");
  assert.equal(e.event_id, "c1:LeadEmAnalise");
  assert.equal(e.event_time, Math.floor(new Date("2026-11-09T11:00:00Z").getTime() / 1000));
  assert.deepEqual(e.custom_data, { lead_event_source: "Controller", event_source: "crm" });
  assert.deepEqual(e.user_data.ph, [h("5519992852865")]);
  assert.deepEqual(e.user_data.em, [h("f@x.com")]);
  assert.deepEqual(e.user_data.external_id, [h("c1")]);
  assert.deepEqual(e.user_data.country, [h("br")]);
  const json = JSON.stringify(e);
  for (const proibido of ["Fulano", "12345678900", "500", "5519992852865", "f@x.com"]) assert.equal(json.includes(proibido), false, proibido);
});
