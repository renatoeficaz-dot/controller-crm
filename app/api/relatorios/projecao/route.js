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
    // Além de quantos são, PRECISO saber quando cada um sai — é a última
    // parcela em aberto dele. Sem isso a carteira ficaria congelada no número
    // de hoje e a projeção não enxergaria ninguém entrando nem saindo.
    stageReceb
      ? prisma.contact.findMany({
          where: whereCarteiraRecebimento(stageReceb.id, de),
          select: { id: true, parcelas: { select: { dueDate: true, paid: true } } },
        })
      : [],
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

  const pct = {
    minima: cfg?.metaPctRecebimentoMinima ?? 40,
    media: cfg?.metaPctRecebimentoMedia ?? 55,
    maxima: cfg?.metaPctRecebimento ?? 70,
  };

  // O eixo da simulação é TODO dia de cobrança (seg a sáb) do intervalo, não
  // só os dias que têm meta cadastrada.
  //
  // A curva cadastrada aqui vai de segunda a sexta, mas as parcelas vencem
  // até sábado. Percorrendo só os dias com meta, as saídas que caíam num
  // sábado nunca aconteciam: ninguém largava a carteira e ela inflava
  // (a máxima terminava com 351 clientes onde o certo é ~229 — a soma das
  // vendas dos últimos 10 dias).
  const primeiroDia = metasData[0].data.toISOString().slice(0, 10);
  const ultimoDia = metasData[metasData.length - 1].data.toISOString().slice(0, 10);
  const diasDoPeriodo = [];
  for (let d = chaveDia(primeiroDia); d.toISOString().slice(0, 10) <= ultimoDia; d = new Date(d.getTime() + 86400000)) {
    const dia = d.toISOString().slice(0, 10);
    if (ehDiaUtil(dia)) diasDoPeriodo.push(dia);
  }
  const diasUteis = diasDoPeriodo.length;

  // Avança N dias de cobrança pulando domingo — mesma regra do gerarParcelas,
  // pra o cliente sair da carteira no dia em que a 10ª parcela realmente vence.
  function somarDiasCobranca(dia, n) {
    let d = chaveDia(dia);
    for (let i = 0; i < n; i++) {
      d = new Date(d.getTime() + 86400000);
      if (d.getUTCDay() === 0) d = new Date(d.getTime() + 86400000);
    }
    return d.toISOString().slice(0, 10);
  }

  // Quando cada cliente ATUAL termina: a última parcela ainda em aberto. Quem
  // já quitou e continua na etapa sai logo no começo — senão ficaria pagando
  // pra sempre na simulação.
  const saidaDosAtuais = carteira.map((c) => {
    const abertas = c.parcelas.filter((p) => !p.paid).map((p) => p.dueDate.toISOString().slice(0, 10));
    return abertas.length ? abertas.sort().at(-1) : null;
  });

  // Simula a carteira dia a dia. Um cliente liberado no dia D deve as 10
  // diárias de D+1 até o 10º dia de cobrança — então ele ENTRA na conta de
  // quem paga em D+1 e SAI depois do 10º. Somar a entrada no próprio dia D
  // contaria alguém que ainda não tem parcela vencida.
  function simular(vendasPorDia) {
    const entram = new Map();
    const saem = new Map();

    // Os que já estão na carteira contam desde o primeiro dia.
    let ativosIniciais = 0;
    for (const saida of saidaDosAtuais) {
      ativosIniciais += 1;
      // Sem parcela em aberto: sai no primeiro dia. Última parcela no passado:
      // idem — não há mais o que cobrar dele daqui pra frente.
      const fim = saida && saida >= diasDoPeriodo[0] ? saida : diasDoPeriodo[0];
      const depois = somarDiasCobranca(fim, 1);
      saem.set(depois, (saem.get(depois) || 0) + 1);
    }

    for (const [dia, qtd] of vendasPorDia) {
      if (!qtd) continue;
      const inicio = somarDiasCobranca(dia, 1);
      const depoisDaUltima = somarDiasCobranca(dia, 11);
      entram.set(inicio, (entram.get(inicio) || 0) + qtd);
      saem.set(depoisDaUltima, (saem.get(depoisDaUltima) || 0) + qtd);
    }

    let ativos = ativosIniciais;
    const serie = [];
    for (const dia of diasDoPeriodo) {
      ativos += entram.get(dia) || 0;
      ativos -= saem.get(dia) || 0;
      if (ativos < 0) ativos = 0;
      serie.push({ dia, ativos, pagantes: ativos });
    }
    return serie;
  }

  // Exatamente o mesmo encadeamento que registrarMetaDoDia usa: a meta que a
  // projeção mostra tem que ser a meta ESTIPULADA, não uma derivada.
  //
  // (Uma versão anterior inventava mínima/média como proporção da máxima, pra
  // os três níveis "ficarem comparáveis". Isso mostrava número que não estava
  // configurado em lugar nenhum — projeção que não bate com a meta real não
  // serve pra decidir nada.)
  const vendasDe = (m, nivel) => {
    const ov = overrideDow.get(m.data.getUTCDay());
    if (nivel === "maxima") {
      return m.metaVendasDia ?? ov?.metaVendasDia ?? cfg?.metaVendasDia ?? 5;
    }
    if (nivel === "media") return ov?.metaVendasMedia ?? cfg?.metaVendasMedia ?? 3;
    return ov?.metaVendasMinima ?? cfg?.metaVendasMinima ?? 2;
  };

  // Mínima/média vêm de valor FIXO enquanto a máxima segue a curva por data?
  // Então os três níveis não são comparáveis, e é preciso dizer isso na tela
  // em vez de deixar o usuário achar que a conta está errada.
  const temCurvaPorData = metasData.some((m) => m.metaVendasDia != null);
  const minimaMediaSaoFixas = !porDiaSemana.length;

  const niveis = ["minima", "media", "maxima"].map((chave) => {
    const rotulo = { minima: "Mínima", media: "Média", maxima: "Máxima" }[chave];
    const vendas = metasData.reduce((s, m) => s + vendasDe(m, chave), 0);
    const capital = vendas * ticketMedio;
    const retorno = capital * (1 + honorariosPct / 100);
    const lucroBruto = retorno - capital;
    const perda = capital * taxaPerda;

    // Carteira dia a dia neste cenário: entra quem é liberado, sai quem fecha
    // as 10 diárias.
    const vendasPorDia = new Map(
      metasData.map((m) => [m.data.toISOString().slice(0, 10), vendasDe(m, chave)])
    );
    const serie = simular(vendasPorDia);
    const ativos = serie.map((d) => d.ativos);
    const mediaAtivos = ativos.length ? ativos.reduce((a, b) => a + b, 0) / ativos.length : 0;

    // Recebimento sai da carteira SIMULADA de cada dia, não da de hoje parada:
    // com a carteira crescendo, usar o número de hoje subestimava o caixa.
    const recebDiario = serie.map((d) => Math.ceil((d.pagantes * pct[chave]) / 100) * parcelaMedia);
    const recebTotal = recebDiario.reduce((a, b) => a + b, 0);
    const recebMedio = recebDiario.length ? recebTotal / recebDiario.length : 0;

    return {
      chave,
      rotulo,
      vendas,
      capitalALiberar: r2(capital),
      retornoEsperado: r2(retorno),
      lucroBruto: r2(lucroBruto),
      perdaEsperada: r2(perda),
      lucroLiquido: r2(lucroBruto - perda),
      recebimentoMedioDia: r2(recebMedio),
      recebimentoTotalPeriodo: r2(recebTotal),
      clientesPagandoDia: Math.round(
        serie.length ? serie.reduce((s, d) => s + Math.ceil((d.pagantes * pct[chave]) / 100), 0) / serie.length : 0
      ),
      // "Quantos clientes vão estar ativos" — o que foi pedido.
      clientesAtivos: {
        inicio: ativos[0] ?? 0,
        fim: ativos.at(-1) ?? 0,
        media: Math.round(mediaAtivos),
        pico: ativos.length ? Math.max(...ativos) : 0,
      },
    };
  });

  return NextResponse.json({
    // Premissas à vista: projeção sem premissa é número que ninguém confere.
    premissas: {
      // Avisa quando mínima/média são um número fixo por dia e a máxima segue
      // a curva por data: sem isso os totais parecem errados.
      niveisIncomparaveis: temCurvaPorData && minimaMediaSaoFixas,
      minimaPorDia: cfg?.metaVendasMinima ?? 2,
      mediaPorDia: cfg?.metaVendasMedia ?? 3,
      diasComMeta: metasData.length,
      diasUteis,
      de: metasData[0].data.toISOString().slice(0, 10),
      ate: metasData[metasData.length - 1].data.toISOString().slice(0, 10),
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
