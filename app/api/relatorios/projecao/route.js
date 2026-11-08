import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { NUM_PARCELAS } from "@/lib/finance";
import { chaveDia, hojeStr, ehDiaUtil, somarDias, esperadoPorDia, metaLiberacaoDe, whereCarteiraRecebimento } from "@/lib/metas";

const r2 = (n) => Math.round(n * 100) / 100;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const PADRAO_DIAS = 30; // sem "até": 30 dias a partir de "de"
const MAX_DIAS = 120;

// Projeção de recebimento e lucro SE as metas forem batidas.
//
// As metas são as MESMAS da tela de Metas, em R$ (a curva antiga de metas de vendas por quantidade não é mais perseguida por ninguém):
//  • recebimento: X% das parcelas que vencem em cada dia (ver esperadoPorDia);
//  • liberação: Y% do capital que volta em cada dia (sábado vale a metade — metaLiberacaoDe).
// Cada nível (mínima, média, meta cheia) usa os 3 % configurados. A simulação anda dia a dia: o que vence vem da carteira de hoje (parcelas
// já geradas) MAIS as parcelas dos empréstimos que a própria meta de liberação cria — cada empréstimo novo deve NUM_PARCELAS diárias a
// partir do próximo dia de cobrança, e o capital delas volta a alimentar a meta de liberação dos dias seguintes.
export async function GET(req) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const url = new URL(req.url);
  const hoje = hojeStr();
  const dePedido = url.searchParams.get("de");
  const atePedido = url.searchParams.get("ate");
  // Projeção olha pra frente: o início nunca é antes de hoje (a carteira e as parcelas de dias passados já são fato).
  const de = DATA.test(dePedido || "") && dePedido > hoje ? dePedido : hoje;
  let ate = DATA.test(atePedido || "") ? atePedido : somarDias(de, PADRAO_DIAS - 1);
  if (ate < de) ate = de;
  if (ate > somarDias(de, MAX_DIAS - 1)) ate = somarDias(de, MAX_DIAS - 1);

  const [cfg, stageReceb] = await Promise.all([
    prisma.config.findUnique({ where: { id: "singleton" } }),
    prisma.stage.findFirst({ where: { name: "Recebimento" } }),
  ]);
  const honorariosPct = cfg?.honorariosPct ?? 30;

  const diasDoPeriodo = [];
  for (let d = de; d <= ate; d = somarDias(d, 1)) if (ehDiaUtil(d)) diasDoPeriodo.push(d);
  if (!diasDoPeriodo.length) return NextResponse.json({ premissas: { diasComMeta: 0, diasUteis: 0, de, ate }, niveis: [] });

  const [carteira, vendasRecentes, historico, esperados] = await Promise.all([
    // Carteira de hoje: quem foi liberado hoje só começa a pagar amanhã, então não é base de recebimento de hoje. Precisa saber quando cada um
    // sai — a última parcela em aberto dele — senão a carteira ficaria congelada e a projeção não veria ninguém saindo.
    stageReceb
      ? prisma.contact.findMany({
          where: whereCarteiraRecebimento(stageReceb.id, de),
          select: { id: true, parcelas: { select: { dueDate: true, paid: true } } },
        })
      : [],
    // Ticket médio: liberações dos últimos 90 dias. Média mais velha que isso não representa o que a operação empresta hoje.
    prisma.contact.findMany({
      where: {
        entrouRecebimentoEm: { gte: new Date(Date.now() - 90 * 86400000) },
        valorCapital: { gt: 0 },
        excluidoEm: null,
        stage: { name: { not: "Venda perdida" } },
      },
      select: { valorCapital: true },
    }),
    prisma.contact.findMany({
      where: { entrouRecebimentoEm: { not: null }, valorCapital: { gt: 0 }, excluidoEm: null, stage: { name: { not: "Venda perdida" } } },
      select: {
        valorCapital: true,
        deuCalote: true,
        parcelas: { select: { ciclo: true, amount: true, amountPago: true, paid: true, valorPago: true } },
      },
    }),
    // O que vence em cada dia do período (valor e parte de capital): a base das duas metas, igual à tela de Metas.
    esperadoPorDia(de, ate),
  ]);

  const ticketMedio = vendasRecentes.length ? vendasRecentes.reduce((s, c) => s + c.valorCapital, 0) / vendasRecentes.length : 0;
  const parcelaMedia = (ticketMedio * (1 + honorariosPct / 100)) / NUM_PARCELAS;

  // Taxa de perda: DINHEIRO QUE SAIU x DINHEIRO QUE VOLTOU, os dois em capital. Cada contrato conta o capital emprestado em cada ciclo, e a
  // perda nunca passa do que foi emprestado àquele cliente (a primeira versão comparava parcelas com honorários contra um único capital e
  // dava 174%, um número impossível).
  let capitalTotal = 0;
  let perdido = 0;
  for (const c of historico) {
    const ciclos = new Set(c.parcelas.map((p) => p.ciclo || 1)).size || 1;
    const emprestado = c.valorCapital * ciclos;
    capitalTotal += emprestado;
    if (!c.deuCalote) continue;
    const recebido = c.parcelas.reduce((s, p) => s + (p.paid ? (p.amountPago ?? p.amount) : p.valorPago || 0), 0);
    perdido += Math.min(emprestado, Math.max(0, emprestado - recebido));
  }
  const taxaPerda = capitalTotal > 0 ? Math.min(1, perdido / capitalTotal) : 0;

  const pctRec = {
    minima: cfg?.metaPctRecebimentoMinima ?? 40,
    media: cfg?.metaPctRecebimentoMedia ?? 55,
    maxima: cfg?.metaPctRecebimento ?? 70,
  };

  // Próximo dia de cobrança: nunca cai domingo (mesma regra do gerarParcelas).
  function proximoDiaCobranca(dia) {
    let d = new Date(chaveDia(dia).getTime() + 86400000);
    if (d.getUTCDay() === 0) d = new Date(d.getTime() + 86400000);
    return d.toISOString().slice(0, 10);
  }

  // Quando cada cliente ATUAL termina: a última parcela ainda em aberto. Quem já quitou e continua na etapa sai logo no começo — senão
  // ficaria pagando pra sempre na simulação.
  const saidaDosAtuais = carteira.map((c) => {
    const abertas = c.parcelas.filter((p) => !p.paid).map((p) => p.dueDate.toISOString().slice(0, 10));
    return abertas.length ? abertas.sort().at(-1) : null;
  });

  // Quantos clientes ativos há por dia: os de hoje saem na última parcela; cada empréstimo novo entra no próximo dia de cobrança e sai depois
  // da última parcela.
  function clientesAtivosPorDia(emprestimosPorDia) {
    const entram = new Map();
    const saem = new Map();
    for (const saida of saidaDosAtuais) {
      const fim = saida && saida >= diasDoPeriodo[0] ? saida : diasDoPeriodo[0];
      const depois = proximoDiaCobranca(fim);
      saem.set(depois, (saem.get(depois) || 0) + 1);
    }
    for (const [dia, qtd] of emprestimosPorDia) {
      if (!qtd) continue;
      let ultima = dia;
      for (let i = 0; i < NUM_PARCELAS; i++) ultima = proximoDiaCobranca(ultima);
      entram.set(proximoDiaCobranca(dia), (entram.get(proximoDiaCobranca(dia)) || 0) + qtd);
      saem.set(proximoDiaCobranca(ultima), (saem.get(proximoDiaCobranca(ultima)) || 0) + qtd);
    }
    let ativos = saidaDosAtuais.length;
    return diasDoPeriodo.map((dia) => {
      ativos += entram.get(dia) || 0;
      ativos -= saem.get(dia) || 0;
      if (ativos < 0) ativos = 0;
      return ativos;
    });
  }

  const niveis = ["minima", "media", "maxima"].map((chave) => {
    const rotulo = { minima: "Mínima", media: "Média", maxima: "Máxima" }[chave];
    // Parcelas dos empréstimos simulados: valor que vence e parte de capital, por dia de cobrança.
    const venceNovo = new Map();
    const capitalNovo = new Map();
    const emprestimosPorDia = new Map();
    let capital = 0;
    let recebTotal = 0;
    const recebDiario = [];

    for (const dia of diasDoPeriodo) {
      const g = esperados.get(dia);
      // Meta de liberação do dia = Y% do capital que volta (carteira de hoje + empréstimos simulados que vencem nesse dia).
      const capitalQueVolta = (g?.capital || 0) + (capitalNovo.get(dia) || 0);
      const ml = metaLiberacaoDe(capitalQueVolta, cfg, dia);
      const liberar = { minima: ml.minima, media: ml.media, maxima: ml.dia }[chave] || 0;
      capital += liberar;
      emprestimosPorDia.set(dia, ticketMedio > 0 ? liberar / ticketMedio : 0);
      if (liberar > 0) {
        const parcela = (liberar * (1 + honorariosPct / 100)) / NUM_PARCELAS;
        let d = dia;
        for (let i = 1; i <= NUM_PARCELAS; i++) {
          d = proximoDiaCobranca(d);
          venceNovo.set(d, (venceNovo.get(d) || 0) + parcela);
          capitalNovo.set(d, (capitalNovo.get(d) || 0) + liberar / NUM_PARCELAS);
        }
      }
      // Recebimento do dia = X% do que vence (carteira de hoje + parcelas dos empréstimos simulados).
      const receber = (pctRec[chave] / 100) * ((g?.total || 0) + (venceNovo.get(dia) || 0));
      recebDiario.push(receber);
      recebTotal += receber;
    }

    const retorno = capital * (1 + honorariosPct / 100);
    const lucroBruto = retorno - capital;
    const perda = capital * taxaPerda;
    const ativos = clientesAtivosPorDia(emprestimosPorDia);
    const mediaAtivos = ativos.length ? ativos.reduce((a, b) => a + b, 0) / ativos.length : 0;
    const recebMedio = recebDiario.length ? recebTotal / recebDiario.length : 0;

    return {
      chave,
      rotulo,
      vendas: ticketMedio > 0 ? Math.round(capital / ticketMedio) : 0, // nº aproximado de empréstimos (capital ÷ ticket médio)
      capitalALiberar: r2(capital),
      retornoEsperado: r2(retorno),
      lucroBruto: r2(lucroBruto),
      perdaEsperada: r2(perda),
      lucroLiquido: r2(lucroBruto - perda),
      recebimentoMedioDia: r2(recebMedio),
      recebimentoTotalPeriodo: r2(recebTotal),
      clientesPagandoDia: parcelaMedia > 0 ? Math.round(recebMedio / parcelaMedia) : 0,
      clientesAtivos: {
        inicio: Math.round(ativos[0] ?? 0),
        fim: Math.round(ativos.at(-1) ?? 0),
        media: Math.round(mediaAtivos),
        pico: ativos.length ? Math.round(Math.max(...ativos)) : 0,
      },
    };
  });

  return NextResponse.json({
    // Premissas à vista: projeção sem premissa é número que ninguém confere.
    premissas: {
      modelo: "metas em R$ (as mesmas da tela de Metas)",
      pctRecebimento: pctRec,
      pctLiberacao: {
        minima: cfg?.metaPctLiberacaoMinima ?? 80,
        media: cfg?.metaPctLiberacaoMedia ?? 100,
        maxima: cfg?.metaPctLiberacao ?? 110,
      },
      diasComMeta: diasDoPeriodo.length,
      diasUteis: diasDoPeriodo.length,
      de,
      ate,
      ticketMedio: r2(ticketMedio),
      baseTicket: vendasRecentes.length,
      honorariosPct,
      parcelaMedia: r2(parcelaMedia),
      taxaPerdaPct: r2(taxaPerda * 100),
      carteiraAtual: carteira.length,
      numParcelas: NUM_PARCELAS,
    },
    niveis,
  });
}
