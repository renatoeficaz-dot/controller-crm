// Criptografia simples (AES-256-GCM) para segredos guardados no banco, com chave derivada do AUTH_SECRET.
import crypto from "crypto";

function chave() {
  const base = process.env.AUTH_SECRET || "dev-insecure-secret-troque-em-producao";
  return crypto.createHash("sha256").update("segredo:" + base).digest();
}

export function cifrar(texto) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", chave(), iv);
  const enc = Buffer.concat([c.update(String(texto), "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(":");
}

export function decifrar(valor) {
  try {
    const [v, iv, tag, enc] = String(valor || "").split(":");
    if (v !== "v1") return null;
    const d = crypto.createDecipheriv("aes-256-gcm", chave(), Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(enc, "base64")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
