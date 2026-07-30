import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Garante que a linha única de config exista
async function getConfig() {
  return prisma.config.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}

export async function GET() {
  return NextResponse.json(await getConfig());
}

// Atualiza configurações globais (ex.: % de honorários)
export async function PATCH(req) {
  const body = await req.json();
  await getConfig();
  const data = {};
  if ("honorariosPct" in body) data.honorariosPct = Number(body.honorariosPct) || 0;
  if ("multaPct" in body) data.multaPct = Number(body.multaPct) || 0;
  if ("pagamentoHoraLimite" in body) data.pagamentoHoraLimite = (body.pagamentoHoraLimite || "").trim() || null;
  if ("evolutionUrl" in body) data.evolutionUrl = (body.evolutionUrl || "").trim() || null;
  if ("evolutionApiKey" in body) data.evolutionApiKey = (body.evolutionApiKey || "").trim() || null;
  if ("wahaUrl" in body) data.wahaUrl = (body.wahaUrl || "").trim() || null;
  if ("wahaApiKey" in body) data.wahaApiKey = (body.wahaApiKey || "").trim() || null;
  if ("deepinfraApiKey" in body) data.deepinfraApiKey = (body.deepinfraApiKey || "").trim() || null;
  if ("fishAudioApiKey" in body) data.fishAudioApiKey = (body.fishAudioApiKey || "").trim() || null;
  if ("elevenLabsApiKey" in body) data.elevenLabsApiKey = (body.elevenLabsApiKey || "").trim() || null;
  if ("contaLiberacaoId" in body) data.contaLiberacaoId = body.contaLiberacaoId || null;
  if ("contaRecebimentoId" in body) data.contaRecebimentoId = body.contaRecebimentoId || null;
  if ("horarioComercialInicio" in body) data.horarioComercialInicio = (body.horarioComercialInicio || "").trim() || null;
  if ("horarioComercialFim" in body) data.horarioComercialFim = (body.horarioComercialFim || "").trim() || null;
  if ("metaPctRecebimentoMinima" in body) data.metaPctRecebimentoMinima = Math.min(100, Math.max(0, Number(body.metaPctRecebimentoMinima) || 0));
  if ("metaPctRecebimentoMedia" in body) data.metaPctRecebimentoMedia = Math.min(100, Math.max(0, Number(body.metaPctRecebimentoMedia) || 0));
  if ("metaPctRecebimento" in body) data.metaPctRecebimento = Math.min(100, Math.max(0, Number(body.metaPctRecebimento) || 0));
  if ("metaVendasMinima" in body) data.metaVendasMinima = Math.max(0, Number(body.metaVendasMinima) || 0);
  if ("metaVendasMedia" in body) data.metaVendasMedia = Math.max(0, Number(body.metaVendasMedia) || 0);
  if ("metaVendasDia" in body) data.metaVendasDia = Math.max(0, Number(body.metaVendasDia) || 0);
  if ("descontoAtivo" in body) data.descontoAtivo = !!body.descontoAtivo;
  if ("descontoPct" in body) data.descontoPct = Math.min(100, Math.max(0, Number(body.descontoPct) || 0));
  if ("descontoDiasMin" in body) data.descontoDiasMin = Math.max(0, Number(body.descontoDiasMin) || 0);
  if ("descontoMensagem" in body) data.descontoMensagem = (body.descontoMensagem || "").trim() || null;
  if ("alertaWhatsapp" in body) data.alertaWhatsapp = (body.alertaWhatsapp || "").replace(/\D/g, "") || null;
  if ("alertaResumoDiario" in body) data.alertaResumoDiario = !!body.alertaResumoDiario;
  if ("alertaHora" in body) data.alertaHora = (body.alertaHora || "").trim() || null;
  if ("alertaCriticos" in body) data.alertaCriticos = !!body.alertaCriticos;
  if ("alertaCapitalMin" in body) data.alertaCapitalMin = Math.max(0, Number(body.alertaCapitalMin) || 0);

  // Capital escalonado por ciclo. O teto aceita null ("sem teto"), então não
  // pode cair no `|| 0` — zeraria o limite e travaria tudo.
  if ("escalonamentoAtivo" in body) data.escalonamentoAtivo = !!body.escalonamentoAtivo;
  if ("escalonamentoBase" in body) data.escalonamentoBase = Math.max(0, Number(body.escalonamentoBase) || 0);
  if ("escalonamentoIncremento" in body) data.escalonamentoIncremento = Math.max(0, Number(body.escalonamentoIncremento) || 0);
  if ("escalonamentoTeto" in body) {
    data.escalonamentoTeto =
      body.escalonamentoTeto === null || body.escalonamentoTeto === "" ? null : Math.max(0, Number(body.escalonamentoTeto) || 0);
  }
  if ("bloqueioCpfAtivo" in body) data.bloqueioCpfAtivo = !!body.bloqueioCpfAtivo;
  // Dias null = escalonamento por atraso desligado.
  if ("escalonamentoAtrasoDias" in body) {
    data.escalonamentoAtrasoDias =
      body.escalonamentoAtrasoDias === null || body.escalonamentoAtrasoDias === ""
        ? null
        : Math.max(1, Number(body.escalonamentoAtrasoDias) || 1);
  }
  if ("escalonamentoAtrasoResponsavel" in body) {
    data.escalonamentoAtrasoResponsavel = (body.escalonamentoAtrasoResponsavel || "").trim() || null;
  }
  if ("capitalOciosoDias" in body) data.capitalOciosoDias = Math.max(0, Number(body.capitalOciosoDias) || 0);

  // Metas de valor (R$) — 0 significa "meta desligada", então não há mínimo.
  const rs = (v) => Math.max(0, Number(v) || 0);
  for (const c of [
    "metaValorVendasMinima", "metaValorVendasMedia", "metaValorVendasDia",
    "metaRecuperacaoMinima", "metaRecuperacaoMedia", "metaRecuperacaoDia",
  ]) {
    if (c in body) data[c] = rs(body[c]);
  }

  const pct = (v) => Math.min(100, Math.max(0, Number(v) || 0));
  if ("provisaoPct0a7" in body) data.provisaoPct0a7 = pct(body.provisaoPct0a7);
  if ("provisaoPct8a15" in body) data.provisaoPct8a15 = pct(body.provisaoPct8a15);
  if ("provisaoPct16a30" in body) data.provisaoPct16a30 = pct(body.provisaoPct16a30);
  if ("provisaoPct31mais" in body) data.provisaoPct31mais = pct(body.provisaoPct31mais);

  const config = await prisma.config.update({ where: { id: "singleton" }, data });
  return NextResponse.json(config);
}
