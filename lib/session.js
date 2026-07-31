// Helpers de sessão para rotas de API e Server Components (usam next/headers).
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

// Payload da sessão (uid, role, name, exp) a partir do cookie — sem ir ao banco.
export async function getSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  return token ? await verifySession(token) : null;
}

// Usuário atual (carregado do banco, com permissões). null se não logado.
export async function getCurrentUser() {
  const s = await getSession();
  if (!s?.uid) return null;
  return prisma.user.findUnique({
    where: { id: s.uid },
    select: {
      id: true,
      name: true,
      login: true,
      role: true,
      verTodosLeads: true,
      paginasVisiveis: true,
      permissoesExtras: true,
      metaVendasMinimaPropria: true,
      metaVendasMediaPropria: true,
      metaVendasDiaPropria: true,
      kanbansVisiveis: { select: { id: true } },
      numerosVisiveis: { select: { id: true, instance: true } },
    },
  });
}

export function isAdmin(user) {
  return user?.role === "admin";
}

// Lista de instâncias (WhatsApp) cujas mensagens o usuário pode ver.
// Retorna null = sem restrição (admin ou nada configurado) -> vê tudo.
export function instanciasVisiveis(user) {
  if (!user || user.role === "admin") return null;
  const inst = (user.numerosVisiveis || []).map((n) => n.instance).filter(Boolean);
  return inst.length ? inst : null;
}

// IDs das colunas (kanbans) que o usuário pode ver. null = todas.
export function kanbansVisiveis(user) {
  if (!user || user.role === "admin") return null;
  const ids = (user.kanbansVisiveis || []).map((k) => k.id);
  return ids.length ? ids : null;
}

// Páginas (fora de Lançamentos/Configurações, sempre admin) que o usuário
// pode acessar. null = todas (admin ou nada configurado).
export function paginasVisiveis(user) {
  if (!user || user.role === "admin") return null;
  const chaves = (user.paginasVisiveis || "").split(",").map((s) => s.trim()).filter(Boolean);
  return chaves.length ? chaves : null;
}

export function podeAcessarPagina(user, key) {
  const v = paginasVisiveis(user);
  return v === null || v.includes(key);
}

// Vê todos os leads? Admin sempre; senão depende do flag.
export function veTodosLeads(user) {
  return !!user && (user.role === "admin" || user.verTodosLeads);
}

// Cláusula Prisma para filtrar mensagens conforme os WhatsApp permitidos ao usuário.
// undefined = sem filtro. Mensagens sem instância (antigas/enviadas) ficam visíveis.
export function mensagensWhere(user) {
  const inst = instanciasVisiveis(user);
  if (!inst) return undefined;
  return { OR: [{ instance: null }, { instance: { in: inst } }] };
}
