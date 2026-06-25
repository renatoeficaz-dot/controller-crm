import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { connectInstance } from "@/lib/evolution";

async function creds() {
  const cfg = await prisma.config.findUnique({ where: { id: "singleton" } });
  return {
    base: cfg?.evolutionUrl || process.env.EVOLUTION_API_URL || "",
    apikey: cfg?.evolutionApiKey || process.env.EVOLUTION_API_KEY || "",
  };
}

// Conecta o número: cria/conecta a instância na Evolution e devolve o QR Code.
export async function POST(_req, { params }) {
  const { id } = await params;
  const num = await prisma.whatsappNumber.findUnique({ where: { id } });
  if (!num) return NextResponse.json({ error: "Número não encontrado" }, { status: 404 });

  const { base, apikey } = await creds();
  const result = await connectInstance(base, apikey, num.instance);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json(result); // { qr, code } ou { connected: true }
}
