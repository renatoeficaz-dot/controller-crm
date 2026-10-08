import test from "node:test";
import assert from "node:assert/strict";
import { consultarSnoop, resumirSnoop } from "../lib/snoopCliente.mjs";

const cpf = "52998224725";
const chave = "chave-ficticia-snoop";
const responder = (data) => new Response(JSON.stringify({ success: true, data }));

test("usa os dois endpoints documentados e envia segredo apenas no cabeçalho", async () => {
  for (const [tipo, caminho] of [["cadastro", "generic/cpf"], ["telefones", "telefone/cpf"]]) {
    const r = await consultarSnoop(cpf, chave, tipo, async (url, opcoes) => {
      assert.equal(url.origin + url.pathname, `https://snoopintelligence.cloud/api/v2/${caminho}`);
      assert.equal(url.searchParams.get("cpf"), cpf);
      assert.equal(url.toString().includes(chave), false);
      assert.equal(opcoes.headers.Authorization, `Bearer ${chave}`);
      assert.equal(opcoes.redirect, "error");
      assert.equal(opcoes.cache, "no-store");
      return responder(tipo === "cadastro" ? { cpf, nome: "Exemplo", nascimento: "01/01/1990", endereco: "Rua de teste", bairro: "Centro", cidade: "Cidade exemplo", uf: "SP" } : [{ ddd: "11", numero: "900000000" }]);
    });
    assert.equal(r.status, "concluida");
    assert.ok(tipo === "cadastro" ? r.dados.nome : r.dados.telefones.length);
  }
});

test("cadastro preserva campos previstos e rejeita registros de outro CPF", () => {
  const r = resumirSnoop({ success: true, data: { cpf, nome: "Exemplo", raca: "não guardar", renda: 5000, mae: "Terceiro", parentes: [{ telefone: "11900000000" }], enderecos: [{ logradouro: "Rua fictícia", numero: "1", token: "segredo" }], emails: ["exemplo@example.test"] } }, cpf, "cadastro");
  assert.deepEqual(Object.keys(r.dados).sort(), ["cpf", "emails", "enderecos", "nome"]);
  assert.equal(r.dados.enderecos[0].token, undefined);
  assert.equal(resumirSnoop({ success: true, data: { cpf: "11144477735" } }, cpf, "cadastro").status, "erro");
});

test("telefones aceitam lista e objeto; discrepância de CPF e formato desconhecido geram erro", () => {
  assert.deepEqual(resumirSnoop({ success: true, data: { cpf, telefones: ["+55 (11) 90000-0000", "11900000000"] } }, cpf, "telefones").dados.telefones, ["5511900000000"]);
  assert.equal(resumirSnoop({ success: true, data: [{ cpf: "11144477735", numero: "11900000000" }] }, cpf, "telefones").status, "erro");
  assert.equal(resumirSnoop({ success: true, data: { inesperado: ["11900000000"] } }, cpf, "telefones").status, "erro");
  assert.equal(resumirSnoop({ success: true, data: [] }, cpf, "telefones").status, "nao_encontrado");
});

test("não consulta CPF inválido e não expõe erro contendo segredo", async () => {
  let chamou = false;
  await consultarSnoop("00000000000", chave, "cadastro", async () => { chamou = true; });
  assert.equal(chamou, false);
  const r = await consultarSnoop(cpf, chave, "cadastro", async () => { throw new Error(chave); });
  assert.equal(JSON.stringify(r).includes(chave), false);
});

test("trata créditos, limite, chave inválida, não encontrado e resposta inválida", async () => {
  for (const status of [401, 403, 429]) assert.equal((await consultarSnoop(cpf, chave, "cadastro", async () => new Response("", { status }))).suspender, true);
  assert.equal((await consultarSnoop(cpf, chave, "cadastro", async () => new Response("", { status: 404 }))).status, "nao_encontrado");
  assert.equal((await consultarSnoop(cpf, chave, "cadastro", async () => new Response("<html>erro</html>"))).status, "erro");
  assert.equal((await consultarSnoop(cpf, chave, "cadastro", async () => new Response("x".repeat(1_000_001)))).status, "erro");
});
