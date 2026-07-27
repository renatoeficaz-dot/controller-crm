import { prisma } from "@/lib/prisma";
import { onlyDigits } from "@/lib/evolution";
import { NextResponse } from "next/server";

// Redirecionamento de rastreio: /l/[slug] -> abre o WhatsApp do número
// configurado, já com a mensagem pré-preenchida (se houver) mais uma tag
// "[ref:slug]" que a IA/webhook detecta na 1ª mensagem pra atribuir o lead
// a essa campanha automaticamente (ver lib/webhookCommon.js).
export async function GET(_req, { params }) {
  const { slug } = await params;
  const campanha = await prisma.linkCampanha.findUnique({ where: { slug }, include: { numero: true } });
  if (!campanha) return new NextResponse("Link não encontrado.", { status: 404 });

  await prisma.linkCampanha.update({ where: { id: campanha.id }, data: { cliques: { increment: 1 } } });

  const numero = onlyDigits(campanha.numero.number);
  const texto = `${campanha.mensagem ? campanha.mensagem + " " : ""}[ref:${campanha.slug}]`;
  const url = `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
  return NextResponse.redirect(url, { status: 302 });
}
