import { prisma } from "@/lib/prisma";

// Consulta de CNPJ na CNPJá (https://cnpja.com). Usa a API aberta (sem chave, limite de ~5 consultas por minuto) e,
// se existir Config.cnpjaApiKey, a API comercial. Traz o que o analista precisa: situação cadastral, atividade,
// endereço, sócios e razão social — sem depender de pesquisar no site da Receita.
const ABERTA = "https://open.cnpja.com/office/";
const COMERCIAL = "https://api.cnpja.com/office/";

export const cnpjValidoFormato = (v) => /^[0-9A-Za-z]{14}$/.test(String(v || "").replace(/[^0-9A-Za-z]/g, ""));

function montarEndereco(a) {
  if (!a) return null;
  const rua = [a.street, a.number].filter(Boolean).join(", ");
  const resto = [a.details, a.district, [a.city, a.state].filter(Boolean).join(" - ")].filter(Boolean).join(" · ");
  const cep = a.zip ? `CEP ${String(a.zip).replace(/^(\d{5})(\d{3})$/, "$1-$2")}` : "";
  return [rua, resto, cep].filter(Boolean).join(" · ");
}

export function resumirCnpj(d) {
  const membros = Array.isArray(d?.company?.members) ? d.company.members : [];
  return {
    cnpj: d.taxId,
    razaoSocial: d.company?.name || null,
    fantasia: d.alias || null,
    situacao: d.status?.text || null, // "Ativa", "Baixada", "Suspensa", "Inapta"...
    situacaoDesde: d.statusDate || null,
    abertura: d.founded || null,
    matriz: d.head ?? null,
    atividadePrincipal: d.mainActivity ? `${d.mainActivity.id} — ${d.mainActivity.text}` : null,
    atividadesSecundarias: (d.sideActivities || []).slice(0, 5).map((x) => `${x.id} — ${x.text}`),
    endereco: montarEndereco(d.address),
    cep: d.address?.zip || null,
    cidade: d.address ? [d.address.city, d.address.state].filter(Boolean).join(" - ") : null,
    natureza: d.company?.nature?.text || null,
    porte: d.company?.size?.text || null,
    capital: d.company?.equity ?? null,
    simples: d.company?.simples?.optant ?? null,
    mei: d.company?.simei?.optant ?? null,
    telefones: (d.phones || []).slice(0, 3).map((t) => `(${t.area}) ${t.number}`),
    emails: (d.emails || []).slice(0, 2).map((e) => e.address),
    socios: membros.slice(0, 15).map((m) => ({
      nome: m.person?.name || null,
      cargo: m.role?.text || null,
      desde: m.since || null,
      documento: m.person?.taxId || null, // já vem mascarado (***123456**)
    })),
    totalSocios: membros.length,
    consultadoEm: new Date().toISOString(),
  };
}

export async function consultarCnpj(cnpj) {
  const limpo = String(cnpj || "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  if (!cnpjValidoFormato(limpo)) return { ok: false, erro: "CNPJ inválido (precisa ter 14 caracteres)." };
  const cfg = await prisma.config.findUnique({ where: { id: "singleton" }, select: { cnpjaApiKey: true } }).catch(() => null);
  const chave = (cfg?.cnpjaApiKey || "").trim();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch((chave ? COMERCIAL : ABERTA) + limpo, { headers: chave ? { Authorization: chave } : {}, signal: ctrl.signal });
    if (res.status === 404) return { ok: false, erro: "CNPJ não encontrado na Receita." };
    if (res.status === 429) return { ok: false, erro: "Limite de consultas da CNPJá atingido (aguarde 1 minuto e tente de novo)." };
    if (res.status === 400 || res.status === 422) return { ok: false, erro: "CNPJ inválido." };
    if (!res.ok) return { ok: false, erro: `CNPJá respondeu ${res.status}.` };
    const d = await res.json();
    return { ok: true, dados: resumirCnpj(d) };
  } catch (err) {
    return { ok: false, erro: err?.name === "AbortError" ? "A CNPJá demorou demais para responder." : "CNPJá fora do ar." };
  } finally {
    clearTimeout(t);
  }
}

// Consulta o CNPJ do lead, guarda o resumo e completa a razão social (e o endereço comercial) se estiverem vazios.
export async function consultarCnpjDoContato(contactId, { forcar = false } = {}) {
  const c = await prisma.contact.findUnique({ where: { id: contactId }, select: { cnpj: true, razaoSocial: true, enderecoComercial: true, cnpjDados: true } });
  if (!c?.cnpj) return { ok: false, erro: "Este lead não tem CNPJ preenchido." };
  if (c.cnpjDados && !forcar) {
    try { return { ok: true, dados: JSON.parse(c.cnpjDados), jaExistia: true }; } catch {}
  }
  const r = await consultarCnpj(c.cnpj);
  if (!r.ok) return r;
  const data = { cnpjDados: JSON.stringify(r.dados), cnpjConsultadoEm: new Date() };
  if (!c.razaoSocial && r.dados.razaoSocial) data.razaoSocial = r.dados.razaoSocial;
  if (!c.enderecoComercial && r.dados.endereco) data.enderecoComercial = r.dados.endereco;
  await prisma.contact.update({ where: { id: contactId }, data });
  return r;
}
