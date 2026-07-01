import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { disconnectInstance } from "@/lib/evolution";

async function creds() {
  const cfg = await prisma.config.findUnique({ where: { id: "singleton" } });
  return {
    base: cfg?.evolutionUrl || process.env.EVOLUTION_API_URL || "",
    apikey: cfg?.evolutionApiKey || process.env.EVOLUTION_API_KEY || "",
  };
}

// Desconecta de verdade a sessão do WhatsApp na Evolution (logout da instância).
// Diferente do DELETE (que só remove o cadastro no CRM), isso encerra a sessão
// no aparelho — sem isso, a instância continua ativa e recebendo mensagens.
export async function POST(_req, { params }) {
  const { id } = await params;
  const num = await prisma.whatsappNumber.findUnique({ where: { id } });
  if (!num) return NextResponse.json({ error: "Número não encontrado" }, { status: 404 });

  const { base, apikey } = await creds();
  const result = await disconnectInstance(base, apikey, num.instance);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ ok: true });
}
