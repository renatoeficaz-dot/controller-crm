import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { saveMediaBase64 } from "@/lib/mediaStorage";
import { lerCorpo, texto } from "@/lib/corpo";

// Rota PÚBLICA — recebe as fotos (base64) das duas câmeras, localização e
// dispositivo. Só aceita se o consentimento (aceitar/route.js) já rodou —
// mesma trava tanto faz o que a tela pública mostrar, o servidor não confia
// só no front pra isso.
export async function POST(req, { params }) {
  const { token } = await params;
  const sessao = await prisma.videoChamadaSessao.findUnique({ where: { token } });
  if (!sessao) return NextResponse.json({ error: "Link inválido ou expirado." }, { status: 404 });
  if (!sessao.aceitoEm) {
    return NextResponse.json({ error: "É preciso aceitar antes de continuar." }, { status: 400 });
  }

  const body = await lerCorpo(req);
  const data = {};

  if (body.fotoTrasBase64) {
    const url = await saveMediaBase64(body.fotoTrasBase64, "image/jpeg", "foto-tras.jpg").catch(() => null);
    if (url) data.fotoTrasUrl = url;
  }
  if (body.fotoFrenteBase64) {
    const url = await saveMediaBase64(body.fotoFrenteBase64, "image/jpeg", "foto-frente.jpg").catch(() => null);
    if (url) data.fotoFrenteUrl = url;
  }
  if (body.latitude != null && body.longitude != null) {
    const lat = Number(body.latitude);
    const lng = Number(body.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      data.latitude = lat;
      data.longitude = lng;
    }
  }
  if (body.dispositivo) data.dispositivo = texto(body.dispositivo).slice(0, 500);
  data.capturadoEm = new Date();

  await prisma.videoChamadaSessao.update({ where: { token }, data });

  // As fotos vão pra galeria de mídias da lead (mesma tabela do upload manual
  // de documentos) — sem isso ficavam só presas na sessão da vídeo chamada,
  // sem aparecer em lugar nenhum na ficha do cliente.
  const fotos = [
    data.fotoTrasUrl && { tipo: "selfie", url: data.fotoTrasUrl, fileName: "video-chamada-camera-tras.jpg" },
    data.fotoFrenteUrl && { tipo: "selfie", url: data.fotoFrenteUrl, fileName: "video-chamada-camera-frente.jpg" },
  ].filter(Boolean);
  if (fotos.length) {
    await prisma.documento.createMany({
      data: fotos.map((f) => ({ contactId: sessao.contactId, tipo: f.tipo, url: f.url, fileName: f.fileName, mimeType: "image/jpeg" })),
    });
  }

  // Localização vai pra observação (notes) do lead — é onde o time já olha
  // pra ver anotações do cliente, em vez de ficar só guardada na sessão.
  if (data.latitude != null && data.longitude != null) {
    const contact = await prisma.contact.findUnique({ where: { id: sessao.contactId }, select: { notes: true } });
    const linha = `[Vídeo chamada ${new Date().toLocaleString("pt-BR")}] Localização: https://www.google.com/maps?q=${data.latitude},${data.longitude}`;
    const notes = [contact?.notes, linha].filter(Boolean).join("\n").slice(-20000);
    await prisma.contact.update({ where: { id: sessao.contactId }, data: { notes } });
  }

  return NextResponse.json({ ok: true });
}
