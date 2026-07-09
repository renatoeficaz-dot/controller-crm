import { NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";

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

  try {
    await stat(filePath);
    const buffer = await readFile(filePath);
    const ext = path.extname(fileName).replace(".", "").toLowerCase();
    const contentType = CONTENT_TYPE_BY_EXT[ext] || "application/octet-stream";
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }
}
