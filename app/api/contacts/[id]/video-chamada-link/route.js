import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getCurrentUser } from "@/lib/session";
import { negarSeNaoPodeVerContato } from "@/lib/contatoAcesso";
import { sendWhatsappText } from "@/lib/evolution";
import { lerCorpo } from "@/lib/corpo";

// Cria o link de vídeo chamada com verificação prévia (item novo) — o
// cliente passa por consentimento + captura de câmera/localização/dispositivo
// antes da sala de vídeo ser liberada. Token longo (32 bytes) pra não dar pra
// adivinhar: a URL é a única coisa que protege essa página pública.
export async function POST(req, { params }) {
  const { id } = await params;
  const negado = await negarSeNaoPodeVerContato(id);
  if (negado) return negado;

  const contact = await prisma.contact.findUnique({ where: { id } });
  if (!contact) return NextResponse.json({ error: "Contato não encontrado." }, { status: 404 });
  if (!contact.phone) return NextResponse.json({ error: "Esse lead não tem telefone cadastrado." }, { status: 400 });

  const { instance, enviarWhatsapp } = await lerCorpo(req);
  const user = await getCurrentUser().catch(() => null);
  const token = randomBytes(24).toString("base64url");

  const sessao = await prisma.videoChamadaSessao.create({
    data: { contactId: id, token, criadoPor: user?.name || null },
  });

  // req.url sozinho não serve pra montar um link público: atrás do proxy da
  // VPS o Next enxerga a própria requisição como algo tipo "http://0.0.0.0:3000/…",
  // não o domínio real que o cliente usa. O host de verdade vem no cabeçalho
  // que o proxy encaminha.
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const baseUrl = process.env.APP_URL || `${proto}://${host}`;
  const link = `${baseUrl}/v/${token}`;

  let mensagemEnviada = false;
  let message = null;
  if (enviarWhatsapp !== false) {
    const texto =
      `Olá! Pra continuarmos, precisamos confirmar sua identidade antes da vídeo chamada. ` +
      `Abra o link abaixo no seu celular e siga as instruções:\n\n${link}`;
    const r = await sendWhatsappText(contact.phone, texto, instance).catch(() => ({ ok: false }));
    if (r.ok) {
      message = await prisma.message.create({
        data: { contactId: id, fromMe: true, status: "enviado", instance: instance || null, kind: "text", body: texto },
      });
      mensagemEnviada = true;
    }
  }

  return NextResponse.json({ id: sessao.id, token, link, mensagemEnviada, message });
}
