import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { disconnectInstance } from "@/lib/evolution";
import { disconnectSessionWaha } from "@/lib/waha";

async function creds() {
  const cfg = await prisma.config.findUnique({ where: { id: "singleton" } });
  return {
    base: cfg?.evolutionUrl || process.env.EVOLUTION_API_URL || "",
    apikey: cfg?.evolutionApiKey || process.env.EVOLUTION_API_KEY || "",
    wahaBase: cfg?.wahaUrl || "",
    wahaApikey: cfg?.wahaApiKey || "",
  };
}

// Desconecta de verdade a sessão do WhatsApp (logout). Diferente do DELETE
// (que só remove o cadastro no CRM), isso encerra a sessão no aparelho.
export async function POST(_req, { params }) {
  const { id } = await params;
  const num = await prisma.whatsappNumber.findUnique({ where: { id } });
  if (!num) return NextResponse.json({ error: "Número não encontrado" }, { status: 404 });

  const { base, apikey, wahaBase, wahaApikey } = await creds();
  const result = num.provider === "waha"
    ? await disconnectSessionWaha(wahaBase, wahaApikey, num.instance)
    : await disconnectInstance(base, apikey, num.instance);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ ok: true });
}
