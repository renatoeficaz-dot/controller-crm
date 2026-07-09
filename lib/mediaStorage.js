import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

const EXT_BY_MIME = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/webm": "webm", "audio/wav": "wav",
  "application/pdf": "pdf",
  "video/mp4": "mp4", "video/3gpp": "3gp", "video/quicktime": "mov", "video/webm": "webm",
};

// Salva mídia em disco (volume /app/public/uploads em produção) e devolve o
// caminho público (/uploads/xxxx.ext) — em vez de guardar o arquivo inteiro
// como texto base64 dentro do SQLite, o que inflava o banco (chegou a 1.3GB
// só de fotos/PDFs/vídeos de leads) e deixava o servidor lento/travando.
export async function saveMediaBuffer(buffer, mimetype, fileName) {
  await mkdir(UPLOAD_DIR, { recursive: true });
  const ext = (fileName && path.extname(fileName).replace(".", "")) || EXT_BY_MIME[mimetype] || "bin";
  const name = `${randomUUID()}.${ext}`;
  await writeFile(path.join(UPLOAD_DIR, name), buffer);
  return `/uploads/${name}`;
}

export async function saveMediaBase64(base64, mimetype, fileName) {
  return saveMediaBuffer(Buffer.from(base64, "base64"), mimetype, fileName);
}

// Lê de volta como base64 — necessário pra mandar pra Evolution API (que só
// aceita base64 no corpo) ou pra análise de visão. Aceita tanto o caminho
// novo (/uploads/xxx) quanto o formato antigo (data:mime;base64,...) ainda
// presente em mensagens/templates de antes desta mudança.
export async function readMediaAsBase64(mediaUrl) {
  if (!mediaUrl) return null;
  if (mediaUrl.startsWith("data:")) return mediaUrl.split(",")[1] || null;
  if (mediaUrl.startsWith("/uploads/")) {
    const buffer = await readFile(path.join(process.cwd(), "public", mediaUrl));
    return buffer.toString("base64");
  }
  return null;
}
