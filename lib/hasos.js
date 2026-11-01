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

// Último 8 dígitos do telefone (ignora DDI e o 9º dígito opcional do DDD) — pra casar o número da Hasos com o cadastrado em Configurações → Números.
const fim8 = (v) => String(v || "").replace(/\D/g, "").slice(-8);

// Números da Hasos que ESTE usuário pode usar para ligar, já com o nome cadastrado em Configurações → Números (ex.: "Vendas Capcred").
// Admin: todos. Demais: os marcados em Configurações → Usuários ("WhatsApp que pode usar para ligar"); nenhum marcado = todos.
export async function instanciasDoUsuario(user, instancias) {
  const cadastrados = await prisma.whatsappNumber.findMany({ select: { id: true, label: true, number: true } });
  const comNome = instancias.map((i) => {
    const c = cadastrados.find((n) => fim8(n.number) && fim8(n.number) === fim8(i.phone));
    return { ...i, nome: c?.label || i.nome || null, numeroId: c?.id || null };
  });
  if (!user || user.role === "admin") return comNome;
  const u = await prisma.user.findUnique({ where: { id: user.id }, select: { numerosLigacao: { select: { id: true } } } });
  const liberados = new Set((u?.numerosLigacao || []).map((n) => n.id));
  if (!liberados.size) return comNome;
  return comNome.filter((i) => i.numeroId && liberados.has(i.numeroId));
}
