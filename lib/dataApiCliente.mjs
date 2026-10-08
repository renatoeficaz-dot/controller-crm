import { validarCPF } from "./cpf.js";

export const limparCpf = (valor) => String(valor || "").replace(/\D/g, "");

export const VERSAO_PUXADA = "cpf_v2_telefones";
const nomeCampo = (valor) => valor.toLowerCase().replace(/[_\s-]/g, "");

// Guarda somente números da seção de telefones do titular. Não percorre
// parentes, endereços ou outros dados que o endpoint completo possa devolver.
export function extrairTelefones(dados) {
  const secoes = Object.entries(dados).filter(([k]) => /^(telefones?|celular(?:es)?|phones?)$/.test(nomeCampo(k)));
  if (!secoes.length) return null;
  const numeros = new Set();
  const adicionar = (valor, ddd = "") => {
    if (typeof valor !== "string" && typeof valor !== "number") return;
    let numero = String(valor).replace(/\D/g, "");
    if ((numero.length === 8 || numero.length === 9) && /^\d{2}$/.test(ddd)) numero = ddd + numero;
    if ((numero.length === 12 || numero.length === 13) && numero.startsWith("55")) numero = numero.slice(2);
    if (/^[1-9]\d(?:[2-9]\d{7}|9\d{8})$/.test(numero)) numeros.add("55" + numero);
  };
  const ler = (valor, nivel = 0) => {
    if (nivel > 4) return;
    if (Array.isArray(valor)) { for (const item of valor.slice(0, 200)) ler(item, nivel + 1); return; }
    if (!valor || typeof valor !== "object") { adicionar(valor); return; }
    const campos = Object.fromEntries(Object.entries(valor).map(([k, v]) => [nomeCampo(k), v]));
    const ddd = String(campos.ddd || campos.codigodearea || "").replace(/\D/g, "");
    for (const [k, v] of Object.entries(campos)) {
      if (/^(numero|telefone|numerotelefone|celular|phone|number)\d*$/.test(k)) adicionar(v, ddd);
      if (/^(telefones|celulares|phones|itens)$/.test(k)) ler(v, nivel + 1);
    }
  };
  for (const [, valor] of secoes) ler(valor);
  return [...numeros];
}

// URL e erros do fetch nunca são registrados: a API exige chave na query string.
export async function consultarCpfDataApi(cpf, chave, buscar = fetch) {
  cpf = limparCpf(cpf);
  if (!validarCPF(cpf)) return { status: "erro", erro: "CPF inválido. Confira os dígitos na ficha." };
  if (!chave?.trim()) return { status: "erro", erro: "Configure a chave da DataAPI." };
  const url = new URL("https://www.data-api.click/api/consulta2.php");
  url.searchParams.set("cpf", cpf);
  url.searchParams.set("key", chave.trim());
  const controle = new AbortController();
  const prazo = setTimeout(() => controle.abort(), 20000);
  try {
    const resposta = await buscar(url, { signal: controle.signal, cache: "no-store", redirect: "error", headers: { Accept: "application/json" } });
    if ([401, 403, 429].includes(resposta.status)) return { status: "erro", suspender: true, erro: "DataAPI bloqueou a consulta. Confira chave, créditos e limite da conta nas configurações." };
    if (!resposta.ok) return { status: "erro", erro: "DataAPI indisponível. Tente novamente mais tarde." };
    // Lê com limite também quando o servidor não informa Content-Length.
    const leitor = resposta.body.getReader();
    let tamanho = 0;
    const blocos = [];
    while (true) {
      const { done, value } = await leitor.read();
      if (done) break;
      tamanho += value.byteLength;
      if (tamanho > 1_000_000) { await leitor.cancel(); return { status: "erro", erro: "A resposta da DataAPI excedeu o tamanho permitido." }; }
      blocos.push(Buffer.from(value));
    }
    const corpo = JSON.parse(Buffer.concat(blocos).toString("utf8"));
    if (corpo?.sucesso !== true) {
      const mensagem = String(corpo?.erro || corpo?.error || corpo?.mensagem || "");
      if (/cr[eé]dito|saldo|key|chave|token|autoriz|limite/i.test(mensagem)) return { status: "erro", suspender: true, erro: "Confira chave, créditos e limite da DataAPI nas configurações." };
      return { status: "erro", erro: "A DataAPI não retornou dados para este CPF." };
    }
    if (!corpo.dados || Array.isArray(corpo.dados) || typeof corpo.dados !== "object") return { status: "erro", erro: "Resposta da DataAPI fora do formato documentado." };
    const campoCpf = Object.keys(corpo.dados).find((k) => k.toLowerCase() === "cpf");
    if (limparCpf(corpo.dados[campoCpf]) !== cpf) return { status: "erro", erro: "O CPF retornado não corresponde ao CPF consultado." };
    const telefones = extrairTelefones(corpo.dados);
    if (telefones === null) return { status: "erro", erro: "A resposta da DataAPI v2 não trouxe uma seção de telefones reconhecida." };
    const dados = { telefones };
    // Algumas APIs ecoam a credencial dentro de mensagens ou outros campos.
    if (JSON.stringify(dados).includes(chave.trim())) return { status: "erro", erro: "A resposta da DataAPI contém informações de acesso e foi descartada." };
    return { status: "concluida", dados };
  } catch {
    return { status: "erro", erro: controle.signal.aborted ? "Tempo de consulta esgotado. Confira o painel antes de tentar novamente." : "Não foi possível obter uma resposta válida da DataAPI." };
  } finally {
    clearTimeout(prazo);
  }
}
