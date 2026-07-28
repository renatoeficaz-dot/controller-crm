import CryptoJS from "crypto-js";

const BASE_URL = "https://detetiveforense.com";
const CPF_ACTION_ID = "60eba89f6351852d6fce2f21f4ad60c66b83573316";
const ROUTER_STATE_TREE =
  '["",{"children":["app",{"children":["modulos",{"children":["investigador-pro",{"children":["__PAGE__",{}]}]}]}]},null,null,true]';

function chars(blocks) {
  return blocks.flat().map((n) => String.fromCharCode(n)).join("");
}

const ENVELOPE_KEY = chars([
  [77, 114, 88, 110], [55, 76, 98, 72], [107, 51, 87, 113], [82, 104, 74, 53],
  [100, 65, 111, 89], [70, 115, 54, 106], [113, 78, 103, 52], [88, 109, 66, 120],
  [57, 85, 116, 75], [108, 71, 56, 99], [80, 105, 90, 55], [101, 68, 110, 83],
  [66, 119, 77, 97], [118, 48, 102, 79], [106, 81, 72, 114], [51, 107, 89, 69],
]);

const LEGACY_KEY = chars([
  [71, 101, 56, 106], [53, 79, 68, 52], [57, 121, 75, 109], [108, 84, 115, 102],
  [50, 122, 85, 112], [73, 80, 108, 68], [97, 70, 109, 102], [118, 48, 119, 81],
  [90, 65, 86, 50], [120, 117, 119, 99], [69, 82, 74, 54], [112, 67, 121, 83],
  [105, 98, 82, 101], [56, 43, 97, 105], [67, 84, 65, 75], [97, 97, 83, 75],
]);

function b64(text) {
  return Buffer.from(text, "utf8").toString("base64");
}

function fromB64(text) {
  return Buffer.from(text, "base64").toString("utf8");
}

function encryptText(text) {
  const aesKey = CryptoJS.lib.WordArray.random(32);
  const iv = CryptoJS.lib.WordArray.random(16);
  const encryptedText = CryptoJS.AES.encrypt(text, aesKey, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  }).toString();
  const encryptedAesKey = CryptoJS.AES.encrypt(CryptoJS.enc.Hex.stringify(aesKey), ENVELOPE_KEY).toString();
  return b64(JSON.stringify({
    dracula: {
      encryptedAesKey,
      encryptedText,
      iv: CryptoJS.enc.Hex.stringify(iv),
    },
  }));
}

function decryptText(payload) {
  const decoded = JSON.parse(fromB64(payload));
  if (decoded?.dracula) {
    const { encryptedAesKey, encryptedText, iv } = decoded.dracula;
    const keyHex = CryptoJS.AES.decrypt(encryptedAesKey, ENVELOPE_KEY).toString(CryptoJS.enc.Utf8);
    const key = CryptoJS.enc.Hex.parse(keyHex);
    const decrypted = CryptoJS.AES.decrypt(encryptedText, key, {
      iv: CryptoJS.enc.Hex.parse(iv),
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });
    return decrypted.toString(CryptoJS.enc.Utf8);
  }
  return CryptoJS.AES.decrypt(payload, LEGACY_KEY).toString(CryptoJS.enc.Utf8);
}

function readCredentials() {
  const username = process.env.DETETIVE_FORENSE_LOGIN;
  const password = process.env.DETETIVE_FORENSE_PASSWORD;
  const pin = process.env.DETETIVE_FORENSE_PIN;
  if (!username || !password || !pin) {
    throw new Error("Credenciais do Detetive Forense nao configuradas no servidor.");
  }
  return {
    username,
    password,
    pin,
    visitorId: process.env.DETETIVE_FORENSE_VISITOR_ID || "controller-crm",
  };
}

function mergeCookie(cookie, setCookieHeaders) {
  const current = new Map();
  for (const part of (cookie || "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key && rest.length) current.set(key, rest.join("="));
  }
  for (const raw of setCookieHeaders || []) {
    const first = raw.split(";")[0];
    const [key, ...rest] = first.split("=");
    if (key && rest.length) current.set(key.trim(), rest.join("=").trim());
  }
  return [...current.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
}

function setCookies(headers) {
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

async function encryptedPost(path, body, cookie = "") {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "text/plain;charset=UTF-8",
      ...(cookie ? { cookie } : {}),
    },
    body: encryptText(JSON.stringify(body)),
    cache: "no-store",
  });
  const text = await res.text();
  let data = {};
  try {
    const decrypted = decryptText(text);
    data = decrypted ? JSON.parse(decrypted) : {};
  } catch {
    data = {};
  }
  return { ok: res.ok, status: res.status, data, cookie: mergeCookie(cookie, setCookies(res.headers)) };
}

async function loginDetetiveForense() {
  const { username, password, pin, visitorId } = readCredentials();
  const first = await encryptedPost("/api/auth/login", { username, password, visitorId });
  if (!first.ok || first.data?.error) {
    throw new Error(first.data?.message || first.data?.error || "Falha no login do Detetive Forense.");
  }
  const second = await encryptedPost("/api/auth/login-pin", { username, password, pin, visitorId }, first.cookie);
  if (!second.ok || second.data?.error || !second.cookie.includes("accessToken=")) {
    throw new Error(second.data?.message || second.data?.error || "Falha na validacao do PIN do Detetive Forense.");
  }
  return second.cookie;
}

function extractActionPayload(text) {
  const match = text.match(/\n2:T[0-9a-f]+,([^\n]+)/);
  if (!match) return null;
  return match[1].trim();
}

export async function consultarCpfDetetive(cpf) {
  const cpfLimpo = String(cpf || "").replace(/\D/g, "");
  if (cpfLimpo.length !== 11) throw new Error("CPF invalido para consulta da puxada.");

  const cookie = await loginDetetiveForense();
  const res = await fetch(`${BASE_URL}/app/modulos/investigador-pro`, {
    method: "POST",
    headers: {
      accept: "text/x-component",
      "content-type": "text/plain;charset=UTF-8",
      cookie,
      "next-action": CPF_ACTION_ID,
      "next-router-state-tree": ROUTER_STATE_TREE,
      "next-url": "/app/modulos/investigador-pro",
      origin: BASE_URL,
      referer: `${BASE_URL}/app/modulos/investigador-pro`,
    },
    body: JSON.stringify([cpfLimpo, null]),
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Detetive Forense respondeu com status ${res.status}.`);
  const encryptedPayload = extractActionPayload(text);
  if (!encryptedPayload) throw new Error("Nao foi possivel ler o retorno da consulta do Detetive Forense.");

  const decrypted = decryptText(encryptedPayload);
  const data = JSON.parse(decrypted);
  if (data?.error) throw new Error(data.message || data.error);
  if (!data?.consulta) throw new Error("Consulta do CPF nao retornou dados para gerar a puxada.");
  return data;
}
