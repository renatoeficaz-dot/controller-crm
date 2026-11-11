import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { negarSeNaoPodeVerContato } from "@/lib/contatoAcesso";
import { lerCorpo, texto } from "@/lib/corpo";

// Links de pagamento InfinitePay de um cliente.
//   GET  ?contactId=                         -> últimos links (aberto/pago/erro)
//   POST { contactId, parcelaIds[], enviar }  -> gera o link (botão "Gerar link" ao lado de Dar baixa) e, se enviar=true, manda no WhatsApp
export async function GET(req) {
  const contactId = new URL(req.url).searchParams.get("contactId");
  if (!contactId) return NextResponse.json({ error: "Cliente não informado." }, { status: 400 });
  const negado = await negarSeNaoPodeVerContato(contactId);
  if (negado) return negado;
  const links = await prisma.cobrancaLink.findMany({ where: { contactId }, orderBy: { createdAt: "desc" }, take: 20 });
  return NextResponse.json(links);
}

export async function POST(req) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const b = await lerCorpo(req);
  const contactId = texto(b.contactId);
  const parcelaIds = Array.isArray(b.parcelaIds) ? b.parcelaIds.filter((x) => typeof x === "string") : [];
  if (!contactId || !parcelaIds.length) return NextResponse.json({ error: "Escolha o cliente e ao menos uma parcela." }, { status: 400 });
  const negado = await negarSeNaoPodeVerContato(contactId);
  if (negado) return negado;
  const P = await import("@/lib/linkPagamentoServidor");
  try {
    const proto = req.headers.get("x-forwarded-proto") || "https";
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
    const r = await P.gerarLink({ contactId, parcelaIds, origem: "manual", usuario: user.name, origemUrl: host ? `${proto}://${host}` : null });
    let envio = null;
    if (b.enviar) {
      const e = await P.enviarLinkWhatsapp({ link: r.link, parcelas: r.parcelas, contato: r.contato, enviadoPor: user.name });
      envio = e.ok ? "enviado" : "falhou";
    }
    return NextResponse.json({ id: r.link.id, url: r.link.url, valor: r.link.valor, reaproveitado: r.reaproveitado, envio });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
