import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { lerCorpo, texto } from "@/lib/corpo";
import { numeroBR } from "@/lib/numeroBR";
// Data "AAAA-MM-DD" do formulário -> meio-dia (não vira o dia em fuso negativo). Inválida = null (antes ia ao Prisma e dava erro 500).
function dataDoForm(v) {
  if (!v) return undefined;
  const d = new Date(String(v).slice(0, 10) + "T12:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}
// Categoria/banco/cliente que não existem (id velho, apagado) davam erro de chave no banco (500). Categoria de saída num lançamento de
// entrada (e o contrário) bagunçava as pizzas por categoria.
async function conferirVinculos({ type, categoriaId, bancoId, contactId }) {
  if (categoriaId) {
    const c = await prisma.lancamentoCategoria.findUnique({ where: { id: categoriaId }, select: { type: true } });
    if (!c) return "Categoria não encontrada.";
    if (c.type !== type) return type === "entrada" ? "Essa categoria é de saída — escolha uma categoria de entrada." : "Essa categoria é de entrada — escolha uma categoria de saída.";
  }
  if (bancoId && !(await prisma.banco.findUnique({ where: { id: bancoId }, select: { id: true } }))) return "Conta (banco) não encontrada.";
  if (contactId && !(await prisma.contact.findUnique({ where: { id: contactId }, select: { id: true } }))) return "Cliente não encontrado.";
  return null;
}


const ORDER_MAP = {
  recentes: { date: "desc" },
  antigos: { date: "asc" },
  maior_valor: { amount: "desc" },
  menor_valor: { amount: "asc" },
};

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const categoriaId = searchParams.get("categoriaId");
  const bancoId = searchParams.get("bancoId");
  const ini = searchParams.get("ini");
  const fim = searchParams.get("fim");
  const responsavel = searchParams.get("responsavel");
  const tagId = searchParams.get("tagId");
  const valorMin = searchParams.get("valorMin");
  const valorMax = searchParams.get("valorMax");
  const order = ORDER_MAP[searchParams.get("sort")] || ORDER_MAP.recentes;

  const where = {};
  if (type) where.type = type;
  if (categoriaId) where.categoriaId = categoriaId;
  if (bancoId) where.bancoId = bancoId;
  // `new Date("qualquer coisa")` não lança: devolve Invalid Date, e o Prisma
  // recusa isso com erro — a rota estourava 500 se ini/fim viessem com algo
  // que não fosse uma data (link editado à mão, filtro salvo antigo).
  // Data inválida é filtro inválido: ignora em vez de derrubar a tela.
  const dataOuNulo = (valor, sufixo) => {
    if (!valor) return null;
    const d = new Date(valor + sufixo);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  // Dia de Brasília: com "Z" a baixa feita depois das 21h (gravada com a hora real) caía no dia seguinte do filtro.
  const dataIni = dataOuNulo(ini, "T00:00:00-03:00");
  const dataFim = dataOuNulo(fim, "T23:59:59.999-03:00");
  if (dataIni || dataFim) {
    where.date = {};
    if (dataIni) where.date.gte = dataIni;
    if (dataFim) where.date.lte = dataFim;
  }
  if (responsavel) where.contact = { responsavel };
  if (tagId) where.contact = { ...(where.contact || {}), tags: { some: { id: tagId } } };
  if (valorMin || valorMax) {
    where.amount = {};
    // Valor que não é número ia como NaN ao Prisma (erro 500); "1.234,56" também é aceito.
    const vMin = numeroBR(valorMin), vMax = numeroBR(valorMax);
    if (valorMin && Number.isFinite(vMin)) where.amount.gte = vMin;
    if (valorMax && Number.isFinite(vMax)) where.amount.lte = vMax;
    if (!Object.keys(where.amount).length) delete where.amount;
  }

  // Relatório de custos (Relatórios › "O período compensou?"): sem o teto de 500 da tela e sem a saída que nasceu do pagamento de uma
  // conta a pagar (ela já entra no custo como conta a pagar — contada aqui também, saía em dobro).
  const paraRelatorio = searchParams.get("relatorio") === "1";
  if (paraRelatorio) {
    const ligados = await prisma.contaPagar.findMany({ where: { lancamentoId: { not: null } }, select: { lancamentoId: true } });
    if (ligados.length) where.id = { notIn: ligados.map((c) => c.lancamentoId) };
  }
  const lancamentos = await prisma.lancamento.findMany({
    where,
    orderBy: order,
    include: {
      categoria: { select: { id: true, name: true, type: true } },
      banco: { select: { id: true, name: true } },
      contact: { select: { id: true, name: true, responsavel: true } },
    },
    take: paraRelatorio ? 5000 : 500,
  });

  // Saldo da conta logo APÓS cada lançamento — precisa do histórico completo
  // (sem os filtros da tela) em ordem cronológica real, senão um lançamento
  // filtrado por categoria/banco mostraria um saldo que ignora tudo que
  // aconteceu fora do filtro, o que não bate com o extrato de verdade.
  // Filtrando por banco, o saldo após cada lançamento é o DAQUELE banco (antes somava todos os bancos e não batia com o extrato da conta).
  const todos = await prisma.lancamento.findMany({
    where: bancoId ? { bancoId } : undefined,
    select: { id: true, type: true, amount: true },
    orderBy: [{ date: "asc" }, { id: "asc" }],
  });
  let acumulado = 0;
  const saldoPorId = new Map();
  for (const l of todos) {
    acumulado += l.type === "entrada" ? l.amount : -l.amount;
    saldoPorId.set(l.id, acumulado);
  }
  const comSaldo = lancamentos.map((l) => ({ ...l, saldoApos: saldoPorId.get(l.id) ?? null }));

  // Totais do filtro inteiro: a tela somava só os 500 lançamentos que recebia, e transferência entre contas entrava como entrada E saída.
  const somas = await prisma.lancamento.groupBy({ by: ["type"], where: { ...where, transferenciaId: null }, _sum: { amount: true }, _count: { _all: true } });
  const total = await prisma.lancamento.count({ where });
  const soma = (t) => Math.round((somas.find((s) => s.type === t)?._sum.amount || 0) * 100) / 100;
  const resumo = { entradas: soma("entrada"), saidas: soma("saida"), total, mostrados: comSaldo.length };
  return NextResponse.json(comSaldo, { headers: { "x-resumo": JSON.stringify(resumo) } });
}

export async function POST(req) {
  const body = await lerCorpo(req);
  const type = body.type;
  const amount = Number(body.amount);
  if (!["entrada", "saida"].includes(type) || !amount || amount <= 0) {
    return NextResponse.json({ error: "Tipo (entrada/saida) e valor positivo obrigatórios." }, { status: 400 });
  }
  const dataLanc = dataDoForm(body.date);
  if (dataLanc === null) return NextResponse.json({ error: "Data inválida." }, { status: 400 });
  const erroVinculo = await conferirVinculos({ type, categoriaId: body.categoriaId || null, bancoId: body.bancoId || null, contactId: body.contactId || null });
  if (erroVinculo) return NextResponse.json({ error: erroVinculo }, { status: 400 });
  const lanc = await prisma.lancamento.create({
    data: {
      type,
      amount,
      description: texto(body.description) || null,
      // "YYYY-MM-DD" puro vira meia-noite UTC — em fuso negativo (Brasil) isso
      // exibe um dia ANTES do que foi escolhido. Meio-dia evita virar o dia
      // em qualquer fuso real.
      date: dataLanc || new Date(),
      categoriaId: body.categoriaId || null,
      bancoId: body.bancoId || null,
      contactId: body.contactId || null,
    },
    include: {
      categoria: { select: { id: true, name: true, type: true } },
      banco: { select: { id: true, name: true } },
      contact: { select: { id: true, name: true, responsavel: true } },
    },
  });
  return NextResponse.json(lanc);
}
