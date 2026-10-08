import test from "node:test";
import assert from "node:assert/strict";
import { lerOpcoesSnoop, validarOpcoesSnoop, filtrarDadosSnoop, PADRAO_SNOOP } from "../lib/snoopOpcoes.mjs";

test("seleções aceitam pausa total e rejeitam campos ou consultas desconhecidos", () => {
  assert.deepEqual(lerOpcoesSnoop(null), PADRAO_SNOOP);
  assert.equal(validarOpcoesSnoop({ consultas: [], campos: [] }), true);
  for (const valor of [{ consultas: ["parentes"], campos: [] }, { consultas: [], campos: ["cpf"] }, { consultas: ["cadastro", "cadastro"], campos: [] }, { consultas: [], campos: [], url: "https://example.test" }]) assert.equal(validarOpcoesSnoop(valor), false);
  assert.deepEqual(lerOpcoesSnoop("inválido"), { consultas: [], campos: [] });
});

test("projeção remove campos ocultos de resultados antigos e não inclui extras", () => {
  const salvo = { cpf: "fictício", nome: "Exemplo", endereco: "Rua fictícia", cidade: "Cidade", emails: ["x@example.test"], telefones: ["número fictício"], parentes: ["ignorar"] };
  assert.deepEqual(filtrarDadosSnoop(salvo, ["nome"]), { nome: "Exemplo" });
  assert.deepEqual(filtrarDadosSnoop(salvo, ["enderecos"]), { endereco: "Rua fictícia", cidade: "Cidade" });
  assert.deepEqual(filtrarDadosSnoop(salvo, []), {});
  assert.equal(salvo.nome, "Exemplo");
});
