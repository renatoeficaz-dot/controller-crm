import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { connectInstance, setWebhook } from "@/lib/evolution";
import { connectSessionWaha, fetchQrWaha } from "@/lib/waha";

// Monta a URL pública do app a partir dos headers da requisição (Traefik define
// host e x-forwarded-proto), para que o webhook funcione em http ou https sem config.
function appWebhookUrl(req, provider) {
  const proto = (req.headers.get("x-forwarded-proto") || "http").split(",")[0].trim();
  const host = req.headers.get("host");
  const path = provider === "waha" ? "/api/webhook/waha" : "/api/webhook/evolution";
  return host ? `${proto}://${host}${path}` : "";
}

async function creds() {
  const cfg = await prisma.config.findUnique({ where: { id: "singleton" } });
  return {
    base: cfg?.evolutionUrl || process.env.EVOLUTION_API_URL || "",
    apikey: cfg?.evolutionApiKey || process.env.EVOLUTION_API_KEY || "",
    wahaBase: cfg?.wahaUrl || "",
    wahaApikey: cfg?.wahaApiKey || "",
  };
}

// Conecta o número: cria/conecta a instância (Evolution) ou sessão (WAHA) e devolve o QR Code.
export async function POST(req, { params }) {
  const { id } = await params;
  const num = await prisma.whatsappNumber.findUnique({ where: { id } });
  if (!num) return NextResponse.json({ error: "Número não encontrado" }, { status: 404 });

  const { base, apikey, wahaBase, wahaApikey } = await creds();
  const webhookUrl = appWebhookUrl(req, num.provider);
  const proxy = num.proxyServer ? { server: num.proxyServer, username: num.proxyUsername, password: num.proxyPassword } : null;

  if (num.provider === "waha") {
    const result = await connectSessionWaha(wahaBase, wahaApikey, num.instance, webhookUrl, proxy);
    if (result.error) return NextResponse.json({ error: result.error }, { status: 502 });
    if (result.connected) return NextResponse.json({ connected: true });
    // Sessão criada/iniciando — o QR só fica pronto depois que o status vira
    // SCAN_QR_CODE (leva 1-3s); tenta algumas vezes antes de desistir.
    let qr = null;
    for (let i = 0; i < 4 && !qr; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, 1200));
      qr = await fetchQrWaha(wahaBase, wahaApikey, num.instance);
    }
    return NextResponse.json(qr ? { qr } : { pending: true });
  }

  const result = await connectInstance(base, apikey, num.instance, proxy);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 502 });

  // Aponta o webhook desta instância para o nosso app (best-effort: não bloqueia a
  // conexão se falhar). Assim as mensagens recebidas passam a entrar automaticamente.
  if (webhookUrl) {
    const hook = await setWebhook(base, apikey, num.instance, webhookUrl);
    result.webhook = hook.ok ? "configurado" : hook.error || "falhou";
  }
  return NextResponse.json(result); // { qr, code, webhook } ou { connected: true, webhook }
}
