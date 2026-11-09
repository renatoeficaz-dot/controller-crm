// Reenvio/simulação das leads que entraram na etapa de análise nos últimos 7 dias.
// Sem --apply só SIMULA (não envia nada, não grava nada). Com --apply envia de verdade (respeita metaCapiTesteCodigo).
// Rodar dentro do container: node --import ./alias_register.mjs scripts/meta-funil-backfill.mjs [--apply]
process.env.TZ = "America/Sao_Paulo";
const { prisma } = await import("@/lib/prisma");
const { lerConfigCapi, enviarLeadAoMeta } = await import("@/lib/metaFunilServidor");
const { eventoParaEtapa, JANELA_MS } = await import("@/lib/metaFunil");
const apply = process.argv.includes("--apply");
const cfg = (await lerConfigCapi()) || {};
const etapa = cfg.etapa || "Análise";
if (apply && (!cfg.ativo || !cfg.dataset || !cfg.token)) { console.log("Integração desligada ou sem dataset/token: nada enviado."); process.exit(1); }
const ini = new Date(Date.now() - JANELA_MS);
const logs = await prisma.etapaLog.findMany({ where: { paraEtapa: etapa, createdAt: { gte: ini } }, orderBy: { createdAt: "asc" }, select: { contactId: true, paraEtapa: true, createdAt: true } });
// uma entrada por lead: a PRIMEIRA dentro da janela
const porLead = new Map();
for (const l of logs) if (!porLead.has(l.contactId)) porLead.set(l.contactId, l);
console.log(`Evento: ${eventoParaEtapa(etapa, cfg)} | etapa: ${etapa} | modo: ${apply ? (cfg.testeCodigo ? "ENVIO DE TESTE" : "ENVIO REAL") : "SIMULAÇÃO"}`);
const cont = {};
for (const l of porLead.values()) {
  const r = await enviarLeadAoMeta({ contactId: l.contactId, paraEtapa: l.paraEtapa, eventoEm: l.createdAt, cfg, simular: !apply });
  const k = r.enviada ? "enviada" : r.motivo;
  cont[k] = (cont[k] || 0) + 1;
  if (r.motivo === "erro") console.log("  erro:", r.erro);
}
console.log("Leads distintas que entraram na etapa:", porLead.size);
console.table(cont);
process.exit(0);
