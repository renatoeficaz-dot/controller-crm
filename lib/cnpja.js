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

const CNPJ_WS = "https://publica.cnpj.ws/cnpj/";

// Converte a resposta do cnpj.ws (gratuita, 3 consultas/min) para o mesmo formato da CNPJá.
function resumirCnpjWs(d) {
  const e = d?.estabelecimento || {};
  const rua = [[e.tipo_logradouro, e.logradouro].filter(Boolean).join(" "), e.numero].filter(Boolean).join(", ");
  const cidadeUf = [e.cidade?.nome, e.estado?.sigla].filter(Boolean).join(" - ");
  const resto = [e.complemento, e.bairro, cidadeUf].filter(Boolean).join(" · ");
  const cep = e.cep ? `CEP ${String(e.cep).replace(/^(\d{5})(\d{3})$/, "$1-$2")}` : "";
  const socios = Array.isArray(d?.socios) ? d.socios : [];
  return {
    cnpj: e.cnpj || null,
    razaoSocial: d?.razao_social || null,
    fantasia: e.nome_fantasia || null,
    situacao: e.situacao_cadastral || null,
    situacaoDesde: e.data_situacao_cadastral || null,
    abertura: e.data_inicio_atividade || null,
    matriz: e.tipo ? /matriz/i.test(e.tipo) : null,
    atividadePrincipal: e.atividade_principal ? `${e.atividade_principal.subclasse || e.atividade_principal.id} — ${e.atividade_principal.descricao}` : null,
    atividadesSecundarias: (e.atividades_secundarias || []).slice(0, 5).map((x) => `${x.subclasse || x.id} — ${x.descricao}`),
    endereco: [rua, resto, cep].filter(Boolean).join(" · ") || null,
    cep: e.cep || null,
    cidade: cidadeUf || null,
    natureza: d?.natureza_juridica?.descricao || null,
    porte: d?.porte?.descricao || null,
    capital: d?.capital_social ? Number(d.capital_social) : null,
    simples: d?.simples?.simples === "Sim" ? true : d?.simples ? false : null,
    mei: d?.simples?.mei === "Sim" ? true : d?.simples ? false : null,
    telefones: [e.ddd1 && e.telefone1 ? `(${e.ddd1}) ${e.telefone1}` : null].filter(Boolean),
    emails: e.email ? [e.email] : [],
    socios: socios.slice(0, 15).map((m) => ({
      nome: m.nome || null,
      cargo: m.qualificacao_socio?.descricao?.trim() || null,
      desde: m.data_entrada || null,
      documento: m.cpf_cnpj_socio || null,
    })),
    totalSocios: socios.length,
    fonte: "cnpj.ws",
    consultadoEm: new Date().toISOString(),
  };
}

async function buscar(url, headers) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    return await fetch(url, { headers, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// cnpj.ws (gratuito) primeiro; se falhar ou bater no limite, CNPJá como reserva.
// Na reserva, usa a chave da CNPJá (Config.cnpjaApiKey) se existir; sem ela, a API aberta.
export async function consultarCnpj(cnpj, { cnpjaPago = true } = {}) {
  const limpo = String(cnpj || "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  if (!cnpjValidoFormato(limpo)) return { ok: false, erro: "CNPJ inválido (precisa ter 14 caracteres)." };
  let erro = "";
  try {
    const res = await buscar(CNPJ_WS + limpo, {});
    if (res.ok) return { ok: true, dados: resumirCnpjWs(await res.json()) };
    if (res.status === 404) return { ok: false, erro: "CNPJ não encontrado na Receita." };
    if (res.status === 400) return { ok: false, erro: "CNPJ inválido." };
    erro = res.status === 429 ? "Limite de consultas atingido (aguarde 1 minuto e tente de novo)." : `cnpj.ws respondeu ${res.status}.`;
  } catch {
    erro = "cnpj.ws fora do ar.";
  }
  const cfg = cnpjaPago ? await prisma.config.findUnique({ where: { id: "singleton" }, select: { cnpjaApiKey: true } }).catch(() => null) : null;
  const chave = (cfg?.cnpjaApiKey || "").trim();
  try {
    const res = await buscar((chave ? COMERCIAL : ABERTA) + limpo, chave ? { Authorization: chave } : {});
    if (res.status === 404) return { ok: false, erro: "CNPJ não encontrado na Receita." };
    if (res.ok) return { ok: true, dados: { ...resumirCnpj(await res.json()), fonte: "cnpja" } };
    return { ok: false, erro: res.status === 429 ? "Limite de consultas atingido (aguarde 1 minuto e tente de novo)." : erro };
  } catch {
    return { ok: false, erro };
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

// CNPJ aberto há menos de 3 meses (data de abertura da Receita): suspeita de fraude.
export function cnpjRecente(dados) {
  const t = Date.parse(String(dados?.abertura || "").slice(0, 10));
  if (!t) return false;
  const limite = new Date();
  limite.setMonth(limite.getMonth() - 3);
  return t > limite.getTime();
}

// Lead em "Análise" com CNPJ de menos de 3 meses (suspeita de fraude) ou endereço comercial diferente do endereço do CNPJ
// (endereços escritos de forma diferente, mas da mesma rua/CEP, passam — ver lib/enderecoCnpj.js) vai para "Venda perdida".
export async function perderSeEnderecoDivergente(contactId) {
  const c = await prisma.contact.findUnique({ where: { id: contactId }, include: { stage: true } });
  if (c?.stage?.name !== "Análise" || !c.cnpjDados) return false;
  const conf = await conferirEnderecoSalvo(contactId);
  if (!conf) return false;
  const { autoMoverVendaPerdida } = await import("@/lib/ia");
  if (!(await prisma.motivoPerda.findUnique({ where: { nome: conf.motivo } }))) await prisma.motivoPerda.create({ data: { nome: conf.motivo } }).catch(() => {});
  return autoMoverVendaPerdida({
    contact: c,
    currentStage: c.stage,
    motivo: conf.motivo,
    acaoAuditoria: conf.acao,
    detalheAuditoria: `${c.name}: ${conf.detalhe} — movido para "Venda perdida" (${conf.motivo})`,
    forcar: true,
  });
}

// Conferência feita pela IA em "Documentação". Devolve { cnpjInvalido: true } (CNPJ que não existe: dígitos não conferem ou
// não achado na Receita → pedir o correto, sem perder o lead), { motivo, detalhe } (endereço comercial diferente do endereço
// do CNPJ → "Venda perdida"), ou null.
export async function conferirCnpjDoLead(contactId) {
  const c = await prisma.contact.findUnique({ where: { id: contactId }, select: { cnpj: true, enderecoComercial: true, cnpjDados: true } });
  const cnpj = String(c?.cnpj || "").replace(/\D/g, "");
  if (cnpj.length !== 14) return null;
  const { cnpjValido } = await import("@/lib/fluxoDoc");
  if (!cnpjValido(cnpj)) return { cnpjInvalido: true };
  if (!String(c.enderecoComercial || "").trim()) return null; // sem endereço ainda: a IA pede antes (consultar agora preencheria o campo sozinho)
  if (!c.cnpjDados) {
    const r = await consultarCnpjDoContato(contactId);
    if (!r.ok) return /não encontrado|inválido/i.test(r.erro || "") ? { cnpjInvalido: true } : null;
  }
  return conferirEnderecoSalvo(contactId);
}

async function conferirEnderecoSalvo(contactId) {
  const c = await prisma.contact.findUnique({ where: { id: contactId }, select: { enderecoComercial: true, cnpjDados: true } });
  let dados = null;
  try { dados = JSON.parse(c?.cnpjDados || "null"); } catch {}
  if (cnpjRecente(dados)) return { motivo: "Suspeita de fraude", acao: "auto_venda_perdida_cnpj_recente", detalhe: `CNPJ aberto há menos de 3 meses (abertura em ${String(dados.abertura).slice(0, 10)})` };
  const { enderecoBateComCnpj } = await import("@/lib/enderecoCnpj");
  const r = enderecoBateComCnpj(c?.enderecoComercial, dados?.endereco);
  return r.bate === false ? { motivo: "Endereço diferente do CNPJ", acao: "auto_venda_perdida_endereco_cnpj", detalhe: `endereço comercial diferente do endereço do CNPJ (${r.motivo})` } : null;
}

// CNPJ que não existe: tira da ficha e do checklist para a IA pedir o correto (só avança quando vier um válido).
export async function descartarCnpjInvalido(contactId) {
  const c = await prisma.contact.findUnique({ where: { id: contactId }, select: { checklistDocumentacao: true } });
  let marcas = {};
  try { marcas = c?.checklistDocumentacao ? JSON.parse(c.checklistDocumentacao) : {}; } catch {}
  delete marcas.cnpj;
  await prisma.contact.update({ where: { id: contactId }, data: { cnpj: null, cnpjDados: null, cnpjConsultadoEm: null, checklistDocumentacao: JSON.stringify(marcas) } });
}
