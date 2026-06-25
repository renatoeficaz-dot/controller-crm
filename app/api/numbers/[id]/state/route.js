import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { instanceState } from "@/lib/evolution";

// Estado da conexão do número (para saber quando o QR foi escaneado)
export async function GET(_req, { params }) {
  const { id } = await params;
  const num = await prisma.whatsappNumber.findUnique({ where: { id } });
  if (!num) return NextResponse.json({ error: "Número não encontrado" }, { status: 404 });

  const cfg = await prisma.config.findUnique({ where: { id: "singleton" } });
  const base = cfg?.evolutionUrl || process.env.EVOLUTION_API_URL || "";
  const apikey = cfg?.evolutionApiKey || process.env.EVOLUTION_API_KEY || "";
  const state = await instanceState(base, apikey, num.instance);
  return NextResponse.json({ state });
}
