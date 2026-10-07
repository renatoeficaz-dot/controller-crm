import test from "node:test";
import assert from "node:assert/strict";
import { consultarCpfDataApi } from "../lib/dataApiCliente.mjs";

// CPFs sintéticos somente em fetch simulado; estes testes nunca acessam a API.
const cpf = "52998224725";
const chave = "credencial-ficticia-para-teste";
const resposta = (dados, extra = {}) => new Response(JSON.stringify({ sucesso: true, dados, ...extra }), { status: 200 });

test("não gasta consulta com CPF inválido ou sem chave", async () => {
  const nunca = () => { throw new Error("Não deveria chamar fetch"); };
  assert.match((await consultarCpfDataApi("11111111111", chave, nunca)).erro, /inválido/);
  assert.match((await consultarCpfDataApi(cpf, "", nunca)).erro, /chave/);
});

test("usa endpoint documentado, sem cache/redirecionamento, e separa dados de terceiros", async () => {
  const r = await consultarCpfDataApi("529.982.247-25", chave, async (url, opcoes) => {
    assert.equal(url.origin + url.pathname, "https://www.data-api.click/api/consulta.php");
    assert.equal(url.searchParams.get("cpf"), cpf);
    assert.equal(url.searchParams.get("key"), chave);
    assert.equal(opcoes.cache, "no-store");
    assert.equal(opcoes.redirect, "error");
    return resposta({ cpf, nome: "Cliente fictício", telefones: ["telefone fictício"], nome_mae: "Terceiro", parentes: [{ nome: "Terceiro" }], extra: { token: "segredo", campo: "valor" } });
  });
  assert.equal(r.status, "concluida");
  assert.equal(r.dados.nome, "Cliente fictício");
  assert.equal(r.dados.nome_mae, undefined);
  assert.equal(r.dados.parentes, undefined);
  assert.deepEqual(r.dados.extra, { campo: "valor" });
});

test("recusa CPF divergente ou ausente na resposta", async () => {
  for (const dados of [{ cpf: "11111111111" }, { nome: "Sem CPF" }]) {
    assert.match((await consultarCpfDataApi(cpf, chave, async () => resposta(dados))).erro, /não corresponde/);
  }
});

test("suspende a integração em falhas de credencial, crédito ou limite", async () => {
  for (const status of [401, 403, 429]) {
    const r = await consultarCpfDataApi(cpf, chave, async () => new Response("", { status }));
    assert.equal(r.suspender, true);
  }
  const r = await consultarCpfDataApi(cpf, chave, async () => resposta(null, { sucesso: false, erro: "Saldo insuficiente" }));
  assert.equal(r.suspender, true);
});

test("não repassa segredo nem mensagem técnica do fornecedor", async () => {
  const falha = await consultarCpfDataApi(cpf, chave, async () => { throw new Error(`URL secreta?key=${chave}`); });
  assert.equal(JSON.stringify(falha).includes(chave), false);
  const eco = await consultarCpfDataApi(cpf, chave, async () => resposta({ cpf, mensagem: chave }));
  assert.equal(eco.status, "erro");
  assert.equal(JSON.stringify(eco).includes(chave), false);
});

test("trata resposta inválida e limita payload", async () => {
  assert.equal((await consultarCpfDataApi(cpf, chave, async () => new Response("<html>Erro</html>"))).status, "erro");
  assert.match((await consultarCpfDataApi(cpf, chave, async () => new Response("x".repeat(1_000_001)))).erro, /tamanho/);
});
