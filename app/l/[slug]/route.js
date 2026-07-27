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
export async function GET(req, { params }) {
  const { slug } = await params;
  const campanha = await prisma.linkCampanha.findUnique({ where: { slug }, include: { numero: true } });
  if (!campanha) return new NextResponse("Link não encontrado.", { status: 404 });

  logClique(req, campanha.id).catch(() => {});

  const numero = onlyDigits(campanha.numero.number);
  const texto = `${campanha.mensagem ? campanha.mensagem + " " : ""}[ref:${campanha.slug}]`;
  const url = `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
  return NextResponse.redirect(url, { status: 302 });
}
