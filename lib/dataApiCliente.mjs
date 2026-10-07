import { validarCPF } from "./cpf.js";

export const limparCpf = (valor) => String(valor || "").replace(/\D/g, "");

// A autorização do cliente abrange seus próprios dados. Parentes e possíveis
// segredos do fornecedor não entram no resultado salvo ou mostrado na ficha.
const terceiros = /^(parentes|parentescos|familiares|vinculos_familiares|filiacao|mae|pai|nome_mae|nome_pai|conjuge|vizinhos)$/i;
const segredo = /key|token|senha|password|secret|authorization/i;
function filtrarDados(valor, chave, profundidade = 0) {
  if (terceiros.test(chave) || segredo.test(chave) || profundidade > 12) return undefined;
  if (typeof valor === "string") return valor.slice(0, 20000);
  if (valor === null || typeof valor === "number" || typeof valor === "boolean") return valor;
  if (Array.isArray(valor)) return valor.slice(0, 200).map((item) => filtrarDados(item, "", profundidade + 1)).filter((item) => item !== undefined);
  if (valor && typeof valor === "object") return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, filtrarDados(v, k, profundidade + 1)]).filter(([, v]) => v !== undefined));
  return undefined;
}

// URL e erros do fetch nunca são registrados: a API exige chave na query string.
export async function consultarCpfDataApi(cpf, chave, buscar = fetch) {
  cpf = limparCpf(cpf);
  if (!validarCPF(cpf)) return { status: "erro", erro: "CPF inválido. Confira os dígitos na ficha." };
  if (!chave?.trim()) return { status: "erro", erro: "Configure a chave da DataAPI." };
  const url = new URL("https://www.data-api.click/api/consulta.php");
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
    const dados = filtrarDados(corpo.dados, "");
    // Algumas APIs ecoam a credencial dentro de mensagens ou outros campos.
    if (JSON.stringify(dados).includes(chave.trim())) return { status: "erro", erro: "A resposta da DataAPI contém informações de acesso e foi descartada." };
    return { status: "concluida", dados };
  } catch {
    return { status: "erro", erro: controle.signal.aborted ? "Tempo de consulta esgotado. Confira o painel antes de tentar novamente." : "Não foi possível obter uma resposta válida da DataAPI." };
  } finally {
    clearTimeout(prazo);
  }
}
