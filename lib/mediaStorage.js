import { randomUUID } from "crypto";
import { mkdir, readFile, readdir, stat, unlink, writeFile } from "fs/promises";
import path from "path";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

const EXT_BY_MIME = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/webm": "webm", "audio/wav": "wav",
  "application/pdf": "pdf",
  "video/mp4": "mp4", "video/3gpp": "3gp", "video/quicktime": "mov", "video/webm": "webm",
};

// public/uploads é servido estático pelo Next, então extensão vira Content-Type
// direto no navegador. .svg pode carregar <script> embutido, e .html/.js
// executam se alguém abrir o link — um documento "malicioso" upado por um
// cliente (ou por um vendedor comprometido) viraria XSS armazenado assim que
// alguém da equipe abrisse o link do anexo.
const EXT_BLOQUEADAS = new Set(["svg", "html", "htm", "js", "mjs", "xhtml", "shtml"]);

// Salva mídia em disco (volume /app/public/uploads em produção) e devolve o
// caminho público (/uploads/xxxx.ext) — em vez de guardar o arquivo inteiro
// como texto base64 dentro do SQLite, o que inflava o banco (chegou a 1.3GB
// só de fotos/PDFs/vídeos de leads) e deixava o servidor lento/travando.
export async function saveMediaBuffer(buffer, mimetype, fileName) {
  const ext = (fileName && path.extname(fileName).replace(".", "").toLowerCase()) || EXT_BY_MIME[mimetype] || "bin";
  if (EXT_BLOQUEADAS.has(ext) || mimetype === "image/svg+xml") {
    throw new Error("Tipo de arquivo não permitido.");
  }
  await mkdir(UPLOAD_DIR, { recursive: true });
  const name = `${randomUUID()}.${ext}`;
  await writeFile(path.join(UPLOAD_DIR, name), buffer);
  return `/uploads/${name}`;
}

export async function saveMediaBase64(base64, mimetype, fileName) {
  return saveMediaBuffer(Buffer.from(base64, "base64"), mimetype, fileName);
}

// Arquivo que ninguém mais referencia (o lead foi apagado de vez pela purga, a
// mensagem pronta foi excluída...) continuava ocupando disco pra sempre — são
// fotos, PDFs e áudios de vários MB cada. Roda 1x por dia junto com a purga.
//
// A carência de 24h existe porque o arquivo é gravado ANTES da linha que o
// aponta: sem ela, um upload em andamento na hora exata da limpeza seria
// apagado no meio do caminho.
const CARENCIA_MS = 24 * 60 * 60 * 1000;

export async function limparMidiasOrfas() {
  const { prisma } = await import("@/lib/prisma");
  const nomes = await readdir(UPLOAD_DIR).catch(() => []);
  if (!nomes.length) return { apagados: 0, bytes: 0 };

  const [mensagens, templates, documentos, contatos] = await Promise.all([
    prisma.message.findMany({ where: { mediaUrl: { not: null } }, select: { mediaUrl: true } }),
    prisma.messageTemplate.findMany({ where: { mediaUrl: { not: null } }, select: { mediaUrl: true } }),
    prisma.documento.findMany({ select: { url: true } }),
    prisma.contact.findMany({ where: { puxadaUrl: { not: null } }, select: { puxadaUrl: true } }),
  ]);

  const emUso = new Set();
  const registra = (url) => { if (url) emUso.add(path.basename(url)); };
  mensagens.forEach((m) => registra(m.mediaUrl));
  templates.forEach((t) => registra(t.mediaUrl));
  documentos.forEach((d) => registra(d.url));
  contatos.forEach((c) => registra(c.puxadaUrl));

  const limite = Date.now() - CARENCIA_MS;
  let apagados = 0;
  let bytes = 0;
  for (const nome of nomes) {
    if (emUso.has(nome)) continue;
    const completo = path.join(UPLOAD_DIR, nome);
    const info = await stat(completo).catch(() => null);
    if (!info || !info.isFile() || info.mtimeMs > limite) continue;
    await unlink(completo).catch(() => {});
    apagados += 1;
    bytes += info.size;
  }
  return { apagados, bytes };
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
