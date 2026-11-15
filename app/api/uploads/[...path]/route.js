import { NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, veTodosLeads, instanciasVisiveis } from "@/lib/session";

// Quem não vê todos os leads só abre anexo de lead seu (documento, mídia de conversa, puxada). Antes bastava estar logado e ter a
// URL: um vendedor abria RG, selfie e comprovante de qualquer cliente da base.
async function podeAbrir(user, url) {
  if (veTodosLeads(user)) return true;
  const [doc, msg, puxada] = await Promise.all([
    prisma.documento.findFirst({ where: { url }, select: { contact: { select: { responsavel: true } } } }),
    prisma.message.findFirst({ where: { mediaUrl: url }, select: { instance: true, contact: { select: { responsavel: true } } } }),
    prisma.contact.findFirst({ where: { puxadaUrl: url }, select: { responsavel: true } }),
  ]);
  const dono = doc?.contact || msg?.contact || puxada;
  if (!dono) return true; // anexo que não é de cliente (template, chat interno, mensagem agendada)
  if (dono.responsavel === user.name) return true;
  // Mídia de conversa: vale também a visibilidade por número de WhatsApp (mesma regra do chat).
  const inst = instanciasVisiveis(user);
  return !!(msg && !doc && !puxada && inst && msg.instance && inst.includes(msg.instance));
}

const CONTENT_TYPE_BY_EXT = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
  ogg: "audio/ogg", mp3: "audio/mpeg", m4a: "audio/mp4", webm: "audio/webm", wav: "audio/wav",
  pdf: "application/pdf",
  mp4: "video/mp4", "3gp": "video/3gpp", mov: "video/quicktime",
};

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

// Serve arquivos de public/uploads escritos DEPOIS do build (anexos recebidos
// em produção) — o static file serving padrão do Next só pega os que existiam
// no momento do build. Ver rewrite em next.config.mjs (/uploads/:path* -> aqui).
export async function GET(_req, { params }) {
  const { path: segments } = await params;
  const fileName = (segments || []).join("/");
  // Sem ".." — não deixa escapar da pasta de uploads
  if (!fileName || fileName.includes("..")) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }
  const filePath = path.join(UPLOAD_DIR, fileName);
  if (!filePath.startsWith(UPLOAD_DIR + path.sep)) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!(await podeAbrir(user, `/uploads/${fileName}`))) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  try {
    await stat(filePath);
    const buffer = await readFile(filePath);
    const ext = path.extname(fileName).replace(".", "").toLowerCase();
    const contentType = CONTENT_TYPE_BY_EXT[ext] || "application/octet-stream";
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        // Documento de cliente (RG, selfie, comprovante) não pode ficar em cache compartilhado ("public" deixava proxy/CDN guardar).
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }
}
