import { prisma } from "@/lib/prisma";

// O link público da vídeo chamada (/v/<token>) não vencia nunca: um link antigo encaminhado ou vazado continuava abrindo a câmera,
// mandando foto e localização "do cliente" e entrando na sala meses depois. Agora vale 48 horas a partir de quando foi gerado.
export const VALIDADE_LINK_MS = 48 * 3600e3;

export async function sessaoPorToken(token) {
  if (typeof token !== "string" || token.length < 20) return null;
  const sessao = await prisma.videoChamadaSessao.findUnique({ where: { token } });
  if (!sessao) return null;
  if (Date.now() - new Date(sessao.criadoEm).getTime() > VALIDADE_LINK_MS) return null;
  return sessao;
}

// Foto da câmera tem que ser imagem de verdade (JPEG/PNG/WebP pelos primeiros bytes) — antes qualquer arquivo era gravado como .jpg
// e virava "documento" do cliente.
export function ehImagem(base64) {
  try {
    const b = Buffer.from(String(base64).replace(/^data:[^,]*,/, "").slice(0, 32), "base64");
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return true; // JPEG
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return true; // PNG
    if (b.slice(0, 4).toString() === "RIFF" && b.slice(8, 12).toString() === "WEBP") return true;
    return false;
  } catch {
    return false;
  }
}
