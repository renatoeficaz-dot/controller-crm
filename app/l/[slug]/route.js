import { prisma } from "@/lib/prisma";
import { onlyDigits } from "@/lib/evolution";
import { parseUserAgent } from "@/lib/userAgent";
import { geoFromIp } from "@/lib/geoip";
import { NextResponse } from "next/server";

// Loga o clique (dispositivo, navegador, região por geoip, UTMs da própria
// URL) em segundo plano — não bloqueia o redirecionamento, o lead não deve
// esperar a geolocalização (pode levar segundos ou falhar).
async function logClique(req, campanhaId) {
  const ua = req.headers.get("user-agent") || "";
  const { dispositivo, navegador } = parseUserAgent(ua);
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || "";
  const url = new URL(req.url);
  const regiao = await geoFromIp(ip);
  await Promise.all([
    prisma.linkCampanha.update({ where: { id: campanhaId }, data: { cliques: { increment: 1 } } }),
    prisma.linkClique.create({
      data: {
        campanhaId,
        dispositivo,
        navegador,
        regiao,
        utmSource: url.searchParams.get("utm_source"),
        utmMedium: url.searchParams.get("utm_medium"),
        utmCampaign: url.searchParams.get("utm_campaign"),
        utmTerm: url.searchParams.get("utm_term"),
        utmContent: url.searchParams.get("utm_content"),
      },
    }),
  ]);
}

// Redirecionamento de rastreio: /l/[slug] -> abre o WhatsApp do número
// configurado, já com a mensagem pré-preenchida (se houver) mais uma tag
// "[ref:slug]" que a IA/webhook detecta na 1ª mensagem pra atribuir o lead
// a essa campanha automaticamente (ver lib/webhookCommon.js).
function urlWhatsapp(campanha) {
  const numero = onlyDigits(campanha.numero.number);
  const texto = `${campanha.mensagem ? campanha.mensagem + " " : ""}[ref:${campanha.slug}]`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

export async function GET(req, { params }) {
  const { slug } = await params;
  const campanha = await prisma.linkCampanha.findUnique({ where: { slug }, include: { numero: true } });
  if (!campanha) return new NextResponse("Link não encontrado.", { status: 404 });

  logClique(req, campanha.id).catch(() => {});

  // "formulario": preenche tudo de uma vez, antes de abrir o WhatsApp.
  if (campanha.modoColeta === "formulario") {
    return NextResponse.redirect(new URL(`/f/${slug}`, req.url), { status: 302 });
  }

  // "perguntar": deixa a pessoa escolher — preencher agora (formulário) ou
  // conversar direto (a IA pergunta um campo de cada vez pelo chat).
  if (campanha.modoColeta === "perguntar") {
    const waUrl = urlWhatsapp(campanha);
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Como prefere continuar?</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;background:#f2f3f8;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:16px}
  .card{background:#fff;border-radius:16px;padding:28px 24px;max-width:380px;width:100%;box-shadow:0 4px 20px rgba(0,0,0,.08);text-align:center}
  h1{font-size:18px;color:#1e293b;margin:0 0 6px}
  p{font-size:13px;color:#64748b;margin:0 0 20px}
  a{display:block;text-decoration:none;border-radius:12px;padding:14px;font-weight:600;font-size:14px;margin-bottom:10px}
  .principal{background:#10b981;color:#fff}
  .secundario{background:#f1f5f9;color:#334155}
</style></head><body>
  <div class="card">
    <h1>Como você prefere continuar?</h1>
    <p>Leva menos de 1 minuto dos dois jeitos.</p>
    <a class="principal" href="/f/${slug}">Preencher um formulário rápido</a>
    <a class="secundario" href="${waUrl}">Prefiro conversar pelo WhatsApp</a>
  </div>
</body></html>`;
    return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  // "chat" (padrão): vai direto pro WhatsApp, como sempre foi.
  return NextResponse.redirect(urlWhatsapp(campanha), { status: 302 });
}
