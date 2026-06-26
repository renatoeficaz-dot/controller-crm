// Sessão assinada (HMAC-SHA256 via Web Crypto). Sem dependências externas e
// compatível com o runtime edge do middleware. NÃO importa next/headers aqui
// (isso fica em lib/session.js, que roda só em rotas/Server Components).

const SECRET = process.env.AUTH_SECRET || "dev-insecure-secret-troque-em-producao";
export const SESSION_COOKIE = "crm_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 dias (segundos)

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64url(bytes) {
  let bin = "";
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = str.length % 4 ? 4 - (str.length % 4) : 0;
  str += "=".repeat(pad);
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function hmacKey() {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

// payload -> token "base64url(json).base64url(hmac)"
export async function signSession(payload) {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const key = await hmacKey();
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return `${body}.${b64url(sig)}`;
}

// token -> payload (ou null se inválido/expirado)
export async function verifySession(token) {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  try {
    const key = await hmacKey();
    const ok = await crypto.subtle.verify("HMAC", key, fromB64url(sig), enc.encode(body));
    if (!ok) return null;
    const payload = JSON.parse(dec.decode(fromB64url(body)));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}
