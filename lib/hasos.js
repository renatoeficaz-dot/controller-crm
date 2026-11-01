import { prisma } from "@/lib/prisma";

// Hasos (https://hasos.com.br): ligação pelo WhatsApp. A chave (x-api-key) fica só no servidor — o navegador recebe
// apenas o token do discador de UM número, emitido na hora.
const BASE = "https://api.hasos.com.br";

export async function chaveHasos() {
  const cfg = await prisma.config.findUnique({ where: { id: "singleton" }, select: { hasosApiKey: true } });
  return (cfg?.hasosApiKey || "").trim();
}

export async function hasosFetch(path, { method = "GET", body } = {}) {
  const chave = await chaveHasos();
  if (!chave) return { ok: false, status: 0, erro: "Chave da Hasos não configurada." };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(BASE + path, {
      method,
      headers: { "x-api-key": chave, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, status: res.status, erro: data?.error || data?.message || `Hasos respondeu ${res.status}.`, data };
    return { ok: true, status: res.status, data };
  } catch {
    return { ok: false, status: 0, erro: "Hasos fora do ar." };
  } finally {
    clearTimeout(t);
  }
}

// Normaliza a resposta de GET /v1/instances (lista, ou { data: [...] }).
export function listaDeInstancias(data) {
  const arr = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : Array.isArray(data?.instances) ? data.instances : [];
  return arr.map((x) => ({
    id: x.id || x.instanceId,
    phone: x.phone || x.number || null,
    nome: x.name || x.label || x.alias || null,
    status: String(x.status || "").toUpperCase(),
  })).filter((x) => x.id);
}
