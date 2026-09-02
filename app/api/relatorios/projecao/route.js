import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { NUM_PARCELAS } from "@/lib/finance";
import { chaveDia, hojeStr, ehDiaUtil, whereCarteiraRecebimento } from "@/lib/metas";

const r2 = (n) => Math.round(n * 100) / 100;

// Projeção de recebimento e lucro SE as metas forem batidas.
//
// Duas perguntas diferentes, respondidas juntas:
//  1. "quanto entra por dia" — vem da meta de RECEBIMENTO (nº de clientes
//     pagando no dia) × valor médio da parcela. É caixa.
//  2. "quanto sobra" — vem da meta de VENDAS, porque o lucro nasce dos
//     honorários do capital que sai agora e volta nas 10 diárias.
//
// As metas de vendas futuras saem de MetaVendasData (a curva planejada), com o
// mesmo encadeamento de fallback que lib/metas.js usa pro dia corrente — se eu
// resolvesse diferente aqui, a projeção mostraria uma meta e a tela de Metas
// mostraria outra.
export async function GET(req) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const url = new URL(req.url);
  const de = url.searchParams.get("de") || hojeStr();
  const ate = url.searchParams.get("ate") || null;

  const [cfg, metasData, porDiaSemana, stageReceb] = await Promise.all([
    prisma.config.findUnique({ where: { id: "singleton" } }),
    prisma.metaVendasData.findMany({
      where: { data: { gte: chaveDia(de), ...(ate ? { lte: chaveDia(ate) } : {}) } },
      orderBy: { data: "asc" },
    }),
    prisma.metaDiaSemana.findMany(),
    prisma.stage.findFirst({ where: { name: "Recebimento" } }),
  ]);

  if (!metasData.length) {
    return NextResponse.json({ premissas: { diasComMeta: 0 }, niveis: [] });
  }

  const overrideDow = new Map(porDiaSemana.map((d) => [d.diaSemana, d]));
  const honorariosPct = cfg?.honorariosPct ?? 30;

  const [carteira, vendasRecentes, historico] = await Promise.all([
    // Mesmo recorte da meta de recebimento: quem foi liberado hoje só começa a
    // pagar amanhã, então não é base de recebimento de hoje.
    stageReceb
      ? prisma.contact.count({ where: whereCarteiraRecebimento(stageReceb.id, de) })
      : 0,
    // Ticket médio: liberações dos últimos 90 dias. Média mais velha que isso
    // não representa o que a operação empresta hoje.
    prisma.contact.findMany({
      where: {
        entrouRecebimentoEm: { gte: new Date(Date.now() - 90 * 86400000) },
        valorCapital: { gt: 0 },
        excluidoEm: null,
      },
      select: { valorCapital: true },
    }),
    prisma.contact.findMany({
      where: { entrouRecebimentoEm: { not: null }, valorCapital: { gt: 0 }, excluidoEm: null },
      select: {
        valorCapital: true,
        deuCalote: true,
        parcelas: { select: { ciclo: true, amount: true, amountPago: true, paid: true, valorPago: true } },
      },
    }),
  ]);

  const ticketMedio = vendasRecentes.length
    ? vendasRecentes.reduce((s, c) => s + c.valorCapital, 0) / vendasRecentes.length
    : 0;
  const parcelaMedia = (ticketMedio * (1 + honorariosPct / 100)) / NUM_PARCELAS;

  // Taxa de perda: DINHEIRO QUE SAIU x DINHEIRO QUE VOLTOU, os dois em capital.
  //
  // A primeira versão comparava "parcelas em aberto" (que embutem honorários e
  // se repetem a cada renovação) contra um único valorCapital, e dava 174% —
  // um número impossível que denunciava a conta errada. Aqui cada contrato
  // conta o capital emprestado em cada ciclo, e a perda nunca passa do que foi
  // emprestado àquele cliente.
  let capitalTotal = 0;
  let perdido = 0;
  for (const c of historico) {
    const ciclos = new Set(c.parcelas.map((p) => p.ciclo || 1)).size || 1;
    const emprestado = c.valorCapital * ciclos;
    capitalTotal += emprestado;
    if (!c.deuCalote) continue;
    const recebido = c.parcelas.reduce(
      (s, p) => s + (p.paid ? (p.amountPago ?? p.amount) : p.valorPago || 0),
      0
    );
    perdido += Math.min(emprestado, Math.max(0, emprestado - recebido));
  }
  const taxaPerda = capitalTotal > 0 ? Math.min(1, perdido / capitalTotal) : 0;

  // Metas de recebimento futuras: % da carteira. A carteira de hoje é a base —
  // ela cresce com as vendas que a própria projeção supõe, então isso é
  // conservador de propósito, e vai declarado nas premissas.
  const pct = {
    minima: cfg?.metaPctRecebimentoMinima ?? 40,
    media: cfg?.metaPctRecebimentoMedia ?? 55,
    maxima: cfg?.metaPctRecebimento ?? 70,
  };
  const recebPorDia = {
    minima: Math.ceil((carteira * pct.minima) / 100) * parcelaMedia,
    media: Math.ceil((carteira * pct.media) / 100) * parcelaMedia,
    maxima: Math.ceil((carteira * pct.maxima) / 100) * parcelaMedia,
  };

  // Só dia útil recebe (domingo é folga) — contar domingo inflaria o total.
  const diasUteis = metasData.filter((m) => ehDiaUtil(m.data.toISOString().slice(0, 10))).length;

  // Mínima e média acompanham a CURVA, não um número fixo.
  //
  // MetaVendasData só guarda a meta cheia do dia (a curva planejada: 4 no
  // começo, 23 no fim). Mínima/média só existem na config, como valores fixos
  // (1 e 2). Usá-los cru dava 64 vendas na mínima contra 994 na máxima — três
  // níveis que não dá pra comparar, e uma "mínima" que a operação já supera
  // hoje. Então aplico ao dia planejado a mesma PROPORÇÃO que a config define
  // entre os níveis (1/3 e 2/3 aqui).
  const cfgMax = cfg?.metaVendasDia ?? 5;
  const razao = {
    minima: cfgMax > 0 ? (cfg?.metaVendasMinima ?? 2) / cfgMax : 0,
    media: cfgMax > 0 ? (cfg?.metaVendasMedia ?? 3) / cfgMax : 0,
  };

  const vendasDe = (m, nivel) => {
    const ov = overrideDow.get(m.data.getUTCDay());
    const planejado = m.metaVendasDia ?? ov?.metaVendasDia ?? cfgMax;
    if (nivel === "maxima") return planejado;
    // Sem proporção utilizável, cai no valor fixo da config — melhor um número
    // conservador que um zero silencioso.
    const fixo = nivel === "media" ? (cfg?.metaVendasMedia ?? 3) : (cfg?.metaVendasMinima ?? 2);
    return razao[nivel] > 0 ? Math.max(1, Math.round(planejado * razao[nivel])) : fixo;
  };

  const niveis = ["minima", "media", "maxima"].map((chave) => {
    const rotulo = { minima: "Mínima", media: "Média", maxima: "Máxima" }[chave];
    const vendas = metasData.reduce((s, m) => s + vendasDe(m, chave), 0);
    const capital = vendas * ticketMedio;
    const retorno = capital * (1 + honorariosPct / 100);
    const lucroBruto = retorno - capital;
    const perda = capital * taxaPerda;

    return {
      chave,
      rotulo,
      vendas,
      capitalALiberar: r2(capital),
      retornoEsperado: r2(retorno),
      lucroBruto: r2(lucroBruto),
      perdaEsperada: r2(perda),
      lucroLiquido: r2(lucroBruto - perda),
      recebimentoMedioDia: r2(recebPorDia[chave]),
      recebimentoTotalPeriodo: r2(recebPorDia[chave] * diasUteis),
      clientesPagandoDia: Math.ceil((carteira * pct[chave]) / 100),
    };
  });

  return NextResponse.json({
    // Premissas à vista: projeção sem premissa é número que ninguém confere.
    premissas: {
      diasComMeta: metasData.length,
      diasUteis,
      de: metasData[0].data.toISOString().slice(0, 10),
      ate: metasData[metasData.length - 1].data.toISOString().slice(0, 10),
      ticketMedio: r2(ticketMedio),
      baseTicket: vendasRecentes.length,
      honorariosPct,
      parcelaMedia: r2(parcelaMedia),
      taxaPerdaPct: r2(taxaPerda * 100),
      carteiraAtual: carteira,
      numParcelas: NUM_PARCELAS,
    },
    niveis,
  });
}
