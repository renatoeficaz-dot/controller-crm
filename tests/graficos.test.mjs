// Contas dos gráficos do painel de Relatórios (lib/graficosRelatorio.js): meses/semanas em Brasília, carteira, recuperação, mapa de calor,
// ranking, ciclos, ticket, atraso, perdas, promessas e resultado mensal.
import test from "node:test";
import assert from "node:assert/strict";
import {
  ultimosMeses, ultimasSemanas, semanaDe, carteiraPorMes, recuperacaoPorSemana, calorDiaHora, ranking, distribuicaoCiclos,
  ticketPorMes, prazoAtrasoPorMes, perdasPorMes, promessasPorUsuario, resultadoMensal,
} from "../lib/graficosRelatorio.js";

test("meses e semanas: viram de ano, semana começa na segunda (domingo ainda é da semana que acabou)", () => {
  assert.deepEqual(ultimosMeses("2026-02-10", 4), ["2025-11", "2025-12", "2026-01", "2026-02"]);
  assert.deepEqual(ultimasSemanas("2026-11-08", 3), ["2026-10-19", "2026-10-26", "2026-11-02"]); // 08/11/2026 é domingo
  assert.equal(semanaDe("2026-11-07"), "2026-11-02"); // sábado
  assert.equal(semanaDe("2026-11-09"), "2026-11-09"); // segunda
});

test("carteira em Recebimento no fim de cada mês pelo histórico de etapas + vencido em aberto", () => {
  const logs = [
    { contactId: "A", paraEtapa: "Recebimento", createdAt: "2026-02-10T15:00:00Z" },
    { contactId: "A", paraEtapa: "Pago", createdAt: "2026-03-20T15:00:00Z" },
    { contactId: "B", paraEtapa: "Recebimento", createdAt: "2026-03-05T15:00:00Z" },
  ];
  const capital = new Map([["A", 300], ["B", 500]]);
  const parcelas = [
    { dueDate: "2026-02-15T00:00:00Z", amount: 100, paid: false, paidAt: null },
    { dueDate: "2026-02-20T00:00:00Z", amount: 50, paid: true, paidAt: "2026-03-02T15:00:00Z" },
    { dueDate: "2026-03-31T00:00:00Z", amount: 70, paid: false, paidAt: null }, // vence só no último dia: não conta como vencida
  ];
  const r = carteiraPorMes({ meses: ["2026-02", "2026-03"], hoje: "2026-03-31", logs, capital, parcelas });
  assert.deepEqual(r, [
    { mes: "2026-02", carteira: 300, atrasado: 150 }, // fim de fevereiro: A em Recebimento; as duas parcelas vencidas e abertas
    { mes: "2026-03", carteira: 500, atrasado: 100 }, // A quitou; a de R$ 50 foi paga em 02/03
  ]);
});

test("recuperação por semana: só conta o que já estava vencido, e o peso no recebido", () => {
  const itens = [
    { dia: "2026-11-02", valor: 100, atrasada: true },
    { dia: "2026-11-07", valor: 300, atrasada: false }, // sábado da mesma semana
    { dia: "2026-11-09", valor: 50, atrasada: true }, // próxima semana
    { dia: "2026-10-01", valor: 999, atrasada: true }, // fora das semanas pedidas
  ];
  const r = recuperacaoPorSemana({ semanas: ["2026-11-02", "2026-11-09"], itens });
  assert.deepEqual(r, [
    { semana: "2026-11-02", recebido: 400, recuperado: 100, pct: 25 },
    { semana: "2026-11-09", recebido: 50, recuperado: 50, pct: 100 },
  ]);
});

test("mapa de calor: dia da semana e hora de Brasília (23h30 de sábado não vira domingo)", () => {
  const c = calorDiaHora([
    { createdAt: "2026-11-07T20:30:00Z", amount: 100 }, // sáb 17:30
    { createdAt: "2026-11-08T02:30:00Z", amount: 40 }, // sáb 23:30 em Brasília
    { createdAt: "2026-11-08T05:00:00Z", amount: 10 }, // dom 02:00
    { createdAt: "2026-11-07T20:45:00Z", amount: 20 },
  ]);
  assert.equal(c.valor[6][17], 120);
  assert.equal(c.qtd[6][17], 2);
  assert.equal(c.valor[6][23], 40);
  assert.equal(c.valor[0][2], 10);
  assert.equal(c.max, 120);
});

test("ranking soma por nome, agrupa sem nome e ordena do maior para o menor", () => {
  const r = ranking([{ n: "Ana", v: 10 }, { n: "Bia", v: 50 }, { n: "Ana", v: 15 }, { n: null, v: 5 }, { n: "  ", v: 1 }], (l) => l.n, (l) => l.v);
  assert.deepEqual(r, [{ nome: "Bia", valor: 50, qtd: 1 }, { nome: "Ana", valor: 25, qtd: 2 }, { nome: "Sem nome", valor: 6, qtd: 2 }]);
});

test("ciclos: quem está no ciclo 3 também passou pelo 2 e pelo 1; % que renovou sobre o ciclo anterior", () => {
  const r = distribuicaoCiclos([1, 1, 2, 3, 3, 3], 4);
  assert.deepEqual(r.map((x) => x.clientes), [6, 4, 3, 0]);
  assert.deepEqual(r.map((x) => x.pctRenovou), [null, 67, 75, 0]);
  assert.equal(distribuicaoCiclos([9], 3)[2].clientes, 1, "ciclo acima do máximo cai na última faixa");
});

test("ticket médio, atraso médio e perdas por mês", () => {
  const meses = ["2026-02", "2026-03"];
  const t = ticketPorMes({ meses, liberacoes: [{ amount: 300, createdAt: "2026-03-01T15:00:00Z" }, { amount: 500, createdAt: "2026-03-09T15:00:00Z" }, { amount: 100, createdAt: "2026-01-09T15:00:00Z" }] });
  assert.deepEqual(t, [{ mes: "2026-02", qtd: 0, total: 0, ticket: 0 }, { mes: "2026-03", qtd: 2, total: 800, ticket: 400 }]);

  const a = prazoAtrasoPorMes({ meses, pagas: [
    { dueDate: "2026-03-10T00:00:00Z", paidAt: "2026-03-12T15:00:00Z" }, // 2 dias
    { dueDate: "2026-03-10T00:00:00Z", paidAt: "2026-03-10T15:00:00Z" }, // em dia
    { dueDate: "2026-03-20T00:00:00Z", paidAt: "2026-03-15T15:00:00Z" }, // adiantada: 0
    { dueDate: "2026-03-10T00:00:00Z", paidAt: "2026-03-14T15:00:00Z" }, // 4 dias
  ] });
  assert.deepEqual(a[1], { mes: "2026-03", n: 4, mediaDias: 1.5, pctEmDia: 50 });
  assert.deepEqual(a[0], { mes: "2026-02", n: 0, mediaDias: 0, pctEmDia: 0 });

  const p = perdasPorMes({ meses, capital: new Map([["A", 300], ["B", 200]]), logsCravo: [
    { contactId: "A", createdAt: "2026-03-02T15:00:00Z" }, { contactId: "A", createdAt: "2026-03-20T15:00:00Z" }, { contactId: "B", createdAt: "2026-02-20T15:00:00Z" },
  ] });
  assert.deepEqual(p, [{ mes: "2026-02", clientes: 1, valor: 200 }, { mes: "2026-03", clientes: 1, valor: 300 }]);
});

test("promessas: cumprida, quebrada e pendente (pagamento antes do registro ou depois do dia prometido não vale)", () => {
  const entradas = new Map([
    ["A", ["2026-03-05T20:00:00Z"]], // 17h do dia prometido: cumpriu
    ["D", ["2026-03-06T10:00:00Z"]], // um dia depois: quebrou
    ["E", ["2026-02-20T10:00:00Z"]], // pagamento ANTES de prometer não conta
  ]);
  const base = { usuario: "Ana", createdAt: "2026-03-01T13:00:00Z" };
  const r = promessasPorUsuario({ hoje: "2026-03-10", entradas, tentativas: [
    { ...base, contactId: "A", dataPromessa: "2026-03-05T00:00:00Z" },
    { ...base, contactId: "B", dataPromessa: "2026-03-05T00:00:00Z" },
    { ...base, contactId: "C", dataPromessa: "2026-03-12T00:00:00Z" },
    { ...base, contactId: "D", dataPromessa: "2026-03-05T00:00:00Z" },
    { ...base, contactId: "E", dataPromessa: "2026-03-05T00:00:00Z" },
    { ...base, contactId: "F", dataPromessa: null },
  ] });
  assert.deepEqual(r, [{ nome: "Ana", cumpridas: 1, quebradas: 3, pendentes: 1, pctCumprido: 25 }]);
});

test("resultado mensal: juros estimados pela taxa, despesas e lucro", () => {
  const r = resultadoMensal({ meses: ["2026-03"], honorariosPct: 80, entradas: [{ amount: 1000, createdAt: "2026-03-02T15:00:00Z" }, { amount: 800, createdAt: "2026-03-20T15:00:00Z" }], despesas: [{ amount: 300, createdAt: "2026-03-05T15:00:00Z" }] });
  assert.deepEqual(r, [{ mes: "2026-03", recebido: 1800, juros: 800, despesas: 300, lucro: 500 }]);
});
