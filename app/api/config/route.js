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
  if ("deepinfraApiKey" in body) data.deepinfraApiKey = (body.deepinfraApiKey || "").trim() || null;
  if ("fishAudioApiKey" in body) data.fishAudioApiKey = (body.fishAudioApiKey || "").trim() || null;
  if ("elevenLabsApiKey" in body) data.elevenLabsApiKey = (body.elevenLabsApiKey || "").trim() || null;
  const config = await prisma.config.update({ where: { id: "singleton" }, data });
  return NextResponse.json(config);
}
