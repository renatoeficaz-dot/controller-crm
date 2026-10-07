import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/auditoria";

// Integração com a Catta API (https://www.catta.com.br/docs/api): dado o telefone de um contato de referência,
// descobre o NOME DO DONO do número (e CPF/CNPJ) para o analista conferir sem ter que pesquisar na mão.
//  - Header "Token: <chave>" (chave guardada em Config.cattaApiKey, nunca no código nem no git).
//  - GET /v1/search/phone?state=BR&query=<DDD+número>  → 1 crédito só quando volta resultado.
//  - Só roda com Config.cattaAtivo ligado e chave preenchida; qualquer falha (sem crédito, conta em análise,
//    fora do ar) vira status "erro" na referência e NUNCA trava o atendimento.
const BASE = "https://api.catta.com.br/v1";

async function configCatta() {
  const cfg = await prisma.config.findUnique({ where: { id: "singleton" }, select: { cattaApiKey: true, cattaAtivo: true } });
  return { chave: (cfg?.cattaApiKey || "").trim(), ativo: !!cfg?.cattaAtivo };
}

async function chamar(chave, caminho, params) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(BASE + caminho + qs, { headers: { Token: chave }, signal: ctrl.signal });
    const corpo = await res.json().catch(() => ({}));
    return { status: res.status, corpo };
  } finally {
    clearTimeout(t);
  }
}

// Estado da conta na Catta (não gasta crédito): créditos e se já pode buscar.
export async function statusCatta() {
  const { chave } = await configCatta();
  if (!chave) return { ok: false, erro: "Chave da Catta não configurada." };
  try {
    const { status, corpo } = await chamar(chave, "/workspace");
    if (status === 401 || status === 422) return { ok: false, erro: "Chave da Catta inválida." };
    if (status !== 200) return { ok: false, erro: corpo?.message || `Catta respondeu ${status}.` };
    return { ok: true, handle: corpo.handle, creditos: corpo.api_credits, podeBuscar: !!corpo.can_search, situacao: corpo.search_status };
  } catch (err) {
    return { ok: false, erro: "Catta fora do ar ou sem resposta (" + (err?.name === "AbortError" ? "tempo esgotado" : err?.message) + ")." };
  }
}

const soDigitos = (v) => String(v || "").replace(/\D/g, "");

// Telefone → "DDD+número" (10 ou 11 dígitos). Tira o 55 do país.
export function telefoneParaCatta(tel) {
  let d = soDigitos(tel);
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  return d.length === 10 || d.length === 11 ? d : null;
}

// Procura o campo de nome num registro sem depender do formato exato (a doc só mostra company_name/cpf_cnpj/person_type).
function pegarNome(r) {
  const chaves = ["name", "full_name", "civil_name", "person_name", "social_name", "company_name", "trade_name", "nome"];
  for (const k of chaves) if (typeof r?.[k] === "string" && r[k].trim()) return r[k].trim();
  for (const [k, v] of Object.entries(r || {})) {
    if (typeof v === "string" && /name|nome/i.test(k) && !/mother|mae|mãe|status|activity|type/i.test(k) && v.trim()) return v.trim();
  }
  return null;
}

export function resumirResultado(corpo) {
  const lista = Array.isArray(corpo?.results) ? corpo.results : [];
  if (!lista.length) return { status: "nao_encontrado", nome: null, documento: null, tipo: null, total: 0, candidatos: [] };
  const primeiro = lista[0];
  if (primeiro?.lgpd_removed) return { status: "removido_lgpd", nome: null, documento: null, tipo: null, total: corpo.total || 1, candidatos: [] };
  const candidatos = lista.slice(0, 3).map((r) => ({ nome: pegarNome(r), documento: r.cpf_cnpj || r.cpf || r.cnpj || null, tipo: r.person_type || null }));
  return {
    status: "encontrado",
    nome: candidatos[0].nome,
    documento: candidatos[0].documento,
    tipo: candidatos[0].tipo,
    total: corpo.total ?? lista.length,
    candidatos,
  };
}

export async function consultarTelefone(telefone) {
  const { chave } = await configCatta();
  const q = telefoneParaCatta(telefone);
  if (!chave) return { status: "erro", erro: "Chave da Catta não configurada." };
  if (!q) return { status: "erro", erro: "Telefone fora do formato (DDD + número)." };
  try {
    const { status, corpo } = await chamar(chave, "/search/phone", { state: "BR", query: q, page: "1" });
    if (status === 200) return resumirResultado(corpo);
    if (status === 403) return { status: "erro", erro: "Conta da Catta sem créditos, com pendência ou ainda não liberada." };
    if (status === 401) return { status: "erro", erro: "Chave da Catta inválida." };
    return { status: "erro", erro: corpo?.message || `Catta respondeu ${status}.` };
  } catch (err) {
    return { status: "erro", erro: "Catta fora do ar ou sem resposta." };
  }
}

// Consulta os donos de todos os contatos de referência do lead que ainda não foram consultados.
// `forcar` repete também os que já têm resultado (gasta crédito de novo) e os que deram erro.
export async function consultarDonosDoContato(contactId, { forcar = false } = {}) {
  const { chave, ativo } = await configCatta();
  if (!chave || !ativo) return { feito: 0, motivo: "desligado" };
  const refs = await prisma.contatoReferencia.findMany({ where: { contactId }, orderBy: { createdAt: "asc" } });
  let feito = 0;
  for (const r of refs.slice(0, 10)) {
    const jaTem = r.donoConsultadoEm && r.donoStatus && r.donoStatus !== "erro";
    if (jaTem && !forcar) continue;
    const res = await consultarTelefone(r.telefone);
    await prisma.contatoReferencia.update({
      where: { id: r.id },
      data: {
        donoStatus: res.status,
        donoNome: res.nome || null,
        donoDocumento: res.documento || null,
        donoTipo: res.tipo || null,
        donoDados: res.candidatos?.length ? JSON.stringify({ total: res.total, candidatos: res.candidatos }) : res.erro ? JSON.stringify({ erro: res.erro }) : null,
        donoConsultadoEm: new Date(),
      },
    });
    feito++;
    if (res.status === "erro" && /sem créditos|inválida|não configurada/i.test(res.erro || "")) break; // não adianta insistir nos demais
    await new Promise((ok) => setTimeout(ok, 400));
  }
  if (feito) {
    registrarAuditoria({ acao: "catta_consulta", entidade: "Contact", entidadeId: contactId, detalhe: `Consulta Catta dos telefones de referência (${feito})` });
  }
  return { feito };
}
