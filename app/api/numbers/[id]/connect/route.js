import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { connectInstance, setWebhook } from "@/lib/evolution";

// Monta a URL pública do app a partir dos headers da requisição (Traefik define
// host e x-forwarded-proto), para que o webhook funcione em http ou https sem config.
function appWebhookUrl(req) {
  const proto = (req.headers.get("x-forwarded-proto") || "http").split(",")[0].trim();
  const host = req.headers.get("host");
  return host ? `${proto}://${host}/api/webhook/evolution` : "";
}

async function creds() {
  const cfg = await prisma.config.findUnique({ where: { id: "singleton" } });
  return {
    base: cfg?.evolutionUrl || process.env.EVOLUTION_API_URL || "",
    apikey: cfg?.evolutionApiKey || process.env.EVOLUTION_API_KEY || "",
  };
}

// Conecta o número: cria/conecta a instância na Evolution e devolve o QR Code.
export async function POST(req, { params }) {
  const { id } = await params;
  const num = await prisma.whatsappNumber.findUnique({ where: { id } });
  if (!num) return NextResponse.json({ error: "Número não encontrado" }, { status: 404 });

  const { base, apikey } = await creds();
  const result = await connectInstance(base, apikey, num.instance);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 502 });

  // Aponta o webhook desta instância para o nosso app (best-effort: não bloqueia a
  // conexão se falhar). Assim as mensagens recebidas passam a entrar automaticamente.
  const webhookUrl = appWebhookUrl(req);
  if (webhookUrl) {
    const hook = await setWebhook(base, apikey, num.instance, webhookUrl);
    result.webhook = hook.ok ? "configurado" : hook.error || "falhou";
  }
  return NextResponse.json(result); // { qr, code, webhook } ou { connected: true, webhook }
}
