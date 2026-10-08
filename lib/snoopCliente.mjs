import { validarCPF } from "./cpf.js";
import { extrairTelefones, limparCpf } from "./dataApiCliente.mjs";

export const VERSOES_SNOOP = { cadastro: "snoop_cadastro_v1", telefones: "snoop_telefones_v1" };
const caminhos = { cadastro: "generic/cpf", telefones: "telefone/cpf" };
const normalizarCampos = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k.toLowerCase().replace(/[_\s-]/g, ""), v]));
const texto = (v) => typeof v === "string" || typeof v === "number" ? String(v).slice(0, 2000) : null;

function endereco(valor) {
  if (typeof valor === "string") return texto(valor);
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null;
  const campos = normalizarCampos(valor);
  return Object.fromEntries(["logradouro", "numero", "complemento", "bairro", "cidade", "municipio", "uf", "cep", "pais"].filter((k) => texto(campos[k])).map((k) => [k, texto(campos[k])]));
}

export function resumirSnoop(corpo, cpf, tipo) {
  if (corpo?.success !== true) return { status: "erro", erro: "O SnoopIntelligence não confirmou o sucesso da consulta." };
  const bruto = corpo.data;
  if (bruto === null || (Array.isArray(bruto) && !bruto.length)) return { status: "nao_encontrado" };
  if (!bruto || typeof bruto !== "object") return { status: "erro", erro: "Resposta do SnoopIntelligence fora do formato documentado." };
  if (tipo === "cadastro") {
    const candidatos = Array.isArray(bruto) ? bruto : [bruto];
    const correspondentes = candidatos.filter((c) => c && typeof c === "object" && limparCpf(normalizarCampos(c).cpf) === cpf);
    if (correspondentes.length !== 1) return { status: "erro", erro: "Não foi possível confirmar um cadastro único para o CPF consultado." };
    const c = normalizarCampos(correspondentes[0]);
    const dados = { cpf };
    for (const [destino, origens] of Object.entries({ nome: ["nome", "name"], nascimento: ["nascimento", "datanascimento"], email: ["email"], bairro: ["bairro"], cidade: ["cidade", "municipio"], uf: ["uf"], cep: ["cep"] })) {
      const valor = origens.map((k) => texto(c[k])).find(Boolean);
      if (valor) dados[destino] = valor;
    }
    if (c.endereco) dados.endereco = endereco(c.endereco);
    if (Array.isArray(c.enderecos)) dados.enderecos = c.enderecos.slice(0, 100).map(endereco).filter(Boolean);
    if (Array.isArray(c.emails)) dados.emails = c.emails.slice(0, 100).map((v) => texto(typeof v === "object" && v ? v.email : v)).filter(Boolean);
    return { status: "concluida", dados };
  }
  // O endpoint é restrito ao CPF pedido. Quando o retorno repete o CPF,
  // exige correspondência antes de aproveitar qualquer telefone.
  const registros = Array.isArray(bruto) ? bruto : [bruto];
  if (registros.some((r) => r && typeof r === "object" && normalizarCampos(r).cpf && limparCpf(normalizarCampos(r).cpf) !== cpf)) return { status: "erro", erro: "O CPF dos telefones retornados não corresponde ao consultado." };
  let telefones = Array.isArray(bruto) ? extrairTelefones({ telefones: bruto }) : extrairTelefones(bruto);
  if (telefones === null && !Array.isArray(bruto)) telefones = extrairTelefones({ telefones: [bruto] });
  if (telefones === null) return { status: "erro", erro: "A resposta do SnoopIntelligence não trouxe telefones em formato reconhecido." };
  if (!telefones.length) {
    // Distingue uma lista realmente vazia de um formato que ainda não conhecemos.
    const vazio = !Array.isArray(bruto) && Object.entries(bruto).some(([k, v]) => /^(telefones|phones)$/i.test(k) && Array.isArray(v) && !v.length);
    return vazio ? { status: "nao_encontrado" } : { status: "erro", erro: "Não foi possível interpretar os telefones retornados pelo SnoopIntelligence." };
  }
  return { status: "concluida", dados: { telefones } };
}

export async function consultarSnoop(cpf, chave, tipo = "cadastro", buscar = fetch) {
  cpf = limparCpf(cpf);
  if (!validarCPF(cpf)) return { status: "erro", erro: "CPF inválido. Confira os dígitos na ficha." };
  if (!chave?.trim()) return { status: "erro", erro: "Cadastre a chave do SnoopIntelligence." };
  if (!Object.hasOwn(caminhos, tipo)) return { status: "erro", erro: "Tipo de consulta inválido." };
  const url = new URL(`https://snoopintelligence.cloud/api/v2/${caminhos[tipo]}`);
  url.searchParams.set("cpf", cpf);
  const controle = new AbortController();
  const prazo = setTimeout(() => controle.abort(), 20000);
  try {
    const res = await buscar(url, { signal: controle.signal, cache: "no-store", redirect: "error", headers: { Accept: "application/json", Authorization: `Bearer ${chave.trim()}` } });
    if ([401, 403, 429].includes(res.status)) return { status: "erro", suspender: true, erro: res.status === 401 ? "Chave do SnoopIntelligence inválida. Confira nas configurações." : res.status === 403 ? "SnoopIntelligence sem créditos ou acesso negado. Confira sua conta." : "Limite do SnoopIntelligence atingido. Aguarde e reative nas configurações." };
    if (res.status === 404) return { status: "nao_encontrado" };
    if (!res.ok) return { status: "erro", erro: "SnoopIntelligence indisponível. Tente novamente mais tarde." };
    const leitor = res.body.getReader();
    const blocos = [];
    let tamanho = 0;
    while (true) {
      const { done, value } = await leitor.read();
      if (done) break;
      tamanho += value.byteLength;
      if (tamanho > 1_000_000) { await leitor.cancel(); return { status: "erro", erro: "Resposta do SnoopIntelligence excedeu o tamanho permitido." }; }
      blocos.push(Buffer.from(value));
    }
    const resultado = resumirSnoop(JSON.parse(Buffer.concat(blocos).toString("utf8")), cpf, tipo);
    if (JSON.stringify(resultado.dados || {}).includes(chave.trim())) return { status: "erro", erro: "A resposta continha uma credencial e foi descartada." };
    return resultado;
  } catch {
    // Nunca repassa erros de fetch: podem carregar URL ou cabeçalhos privados.
    return { status: "erro", erro: controle.signal.aborted ? "Tempo de consulta esgotado. Confira o painel antes de repetir." : "Não foi possível obter uma resposta válida do SnoopIntelligence." };
  } finally { clearTimeout(prazo); }
}
