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
  const config = await prisma.config.update({ where: { id: "singleton" }, data });
  return NextResponse.json(config);
}
