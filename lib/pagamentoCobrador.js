import { prisma } from "@/lib/prisma";
import { inicioDaSemanaTrabalho, diaComissao } from "@/lib/comissao";
import { esperadoPorDia, metaLiberacaoDe } from "@/lib/metas";

// Em que faixa o resultado do dia caiu. Espelha lib/metasResumo.js: a "maxima"
// é a meta cheia do dia. `campos` troca entre as chaves de recebimento
// (metaRecebimentos*) e de venda (metaVendas*) conforme o tipoMeta do cobrador.
function faixaDoDia(valor, meta, campos) {
  if (!meta) return null;
  if (meta[campos.dia] && valor >= meta[campos.dia]) return "maxima";
  if (meta[campos.media] && valor >= meta[campos.media]) return "media";
  if (meta[campos.minima] && valor >= meta[campos.minima]) return "minima";
  return null;
}

const CAMPOS_META = {
  cobranca: { minima: "metaRecebimentosMinima", media: "metaRecebimentosMedia", dia: "metaRecebimentosDia" },
  venda: { minima: "metaLiberacaoMinima", media: "metaLiberacaoMedia", dia: "metaLiberacaoDia" },
};

// Os 6 dias úteis (seg..sáb) da semana que contém `hoje`. Domingo é folga.
export function diasDaSemanaTrabalho(hoje = new Date()) {
  const ini = inicioDaSemanaTrabalho(hoje);
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(ini);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

// Quantas parcelas foram recebidas em cada dia da semana — DA OPERAÇÃO INTEIRA,
// não só do que este cobrador deu baixa (foi o combinado: "vale para todos os
// recebimentos"). Conta parcela baixada, igual ao placar de Metas, pra os dois
// números nunca divergirem na frente do time.
async function recebimentosPorDia(dias) {
  // Folga de 3 dias antes de dias[0]: a semana de comissão fecha sábado 18h,
  // não meia-noite — uma baixa de sábado à noite conta pra segunda da semana
  // SEGUINTE (diaComissao desloca +2 dias), então o registro real no banco
  // fica até 2 dias antes de dias[0] dessa semana seguinte.
  const de = new Date(dias[0] + "T00:00:00.000Z");
  de.setUTCDate(de.getUTCDate() - 3);
  const ate = new Date(dias[dias.length - 1] + "T00:00:00.000Z");
  ate.setUTCDate(ate.getUTCDate() + 2);

  const parcelas = await prisma.parcela.findMany({
    where: {
      OR: [
        { paid: true, paidAt: { gte: de, lt: ate } },
        { paid: false, valorPago: { gt: 0 }, valorPagoEm: { gte: de, lt: ate } },
      ],
    },
    select: { paid: true, paidAt: true, valorPagoEm: true, amount: true, amountPago: true, valorPago: true },
  });

  const porDia = new Map(dias.map((d) => [d, 0]));
  for (const p of parcelas) {
    const data = p.paid ? p.paidAt : p.valorPagoEm;
    if (!data) continue;
    const dia = diaComissao(data);
    // Meta de recebimento é em R$ (o que entrou no dia contra o que vencia no dia).
    const v = Math.min(p.paid ? (p.amountPago != null ? p.amountPago : p.amount) : p.valorPago || 0, p.amount || 0); // sem juros/multa
    if (porDia.has(dia)) porDia.set(dia, Math.round((porDia.get(dia) + v) * 100) / 100);
  }
  return porDia;
}

// Capital liberado (novo + renovação, em R$) em cada dia da semana — DA OPERAÇÃO INTEIRA, mesmo critério da meta de
// liberação de Metas (lançamento de saída "Liberação de capital").
async function vendasPorDia(dias) {
  const de = new Date(dias[0] + "T00:00:00.000Z");
  de.setUTCDate(de.getUTCDate() - 3); // mesmo motivo de recebimentosPorDia acima
  const ate = new Date(dias[dias.length - 1] + "T00:00:00.000Z");
  ate.setUTCDate(ate.getUTCDate() + 2);

  const ls = await prisma.lancamento.findMany({
    where: { type: "saida", description: { startsWith: "Liberação de capital" }, createdAt: { gte: de, lt: ate } },
    select: { amount: true, createdAt: true },
  });

  const porDia = new Map(dias.map((d) => [d, 0]));
  for (const l of ls) {
    const dia = diaComissao(l.createdAt);
    if (porDia.has(dia)) porDia.set(dia, Math.round((porDia.get(dia) + (l.amount || 0)) * 100) / 100);
  }
  return porDia;
}

// Fecha o acerto da semana de um cobrador: fixo + bônus dia a dia.
// `hoje` decide a semana (seg..sáb que contém essa data).
export async function calcularPagamentoSemana(userId, hoje = new Date()) {
  const cfg = await prisma.pagamentoCobradorConfig.findUnique({
    where: { userId },
    include: { user: { select: { id: true, name: true } } },
  });
  if (!cfg || !cfg.ativo) return null;

  const tipoMeta = cfg.tipoMeta === "venda" ? "venda" : "cobranca";
  const campos = CAMPOS_META[tipoMeta];
  const buscarPorDia = tipoMeta === "venda" ? vendasPorDia : recebimentosPorDia;

  const dias = diasDaSemanaTrabalho(hoje);
  const [porDia, metas] = await Promise.all([
    buscarPorDia(dias),
    prisma.metaDiaria.findMany({
      where: { dia: { in: dias.map((d) => new Date(d + "T00:00:00.000Z")) } },
    }),
  ]);
  const metaPorDia = new Map(metas.map((m) => [m.dia.toISOString().slice(0, 10), m]));
  // Cobrança: as faixas são % do que vencia em cada dia (R$), não mais da contagem de leads em Recebimento.
  if (tipoMeta === "venda") {
    // Liberação: % do capital que volta no dia (100% = manter a operação do mesmo tamanho).
    const esperados = await esperadoPorDia(dias[0], dias[dias.length - 1]);
    const cfgLib = await prisma.config.findUnique({ where: { id: "singleton" } });
    for (const dia of dias) {
      const ml = metaLiberacaoDe(esperados.get(dia)?.capital || 0, cfgLib, dia);
      metaPorDia.set(dia, { metaLiberacaoMinima: ml.minima, metaLiberacaoMedia: ml.media, metaLiberacaoDia: ml.dia });
    }
  }
  if (tipoMeta === "cobranca") {
    const esperados = await esperadoPorDia(dias[0], dias[dias.length - 1]);
    for (const [dia, m] of metaPorDia) {
      const total = esperados.get(dia)?.total || 0;
      const r2 = (n) => Math.round(n * 100) / 100;
      metaPorDia.set(dia, {
        ...m,
        metaRecebimentosMinima: r2((total * (m.metaPctRecebimentoMinima || 0)) / 100),
        metaRecebimentosMedia: r2((total * (m.metaPctRecebimentoMedia || 0)) / 100),
        metaRecebimentosDia: r2((total * (m.metaPctRecebimento || 0)) / 100),
      });
    }
  }

  const valorDaFaixa = { minima: cfg.bonusMinima, media: cfg.bonusMedia, maxima: cfg.bonusMaxima };
  const detalhe = dias.map((dia) => {
    const meta = metaPorDia.get(dia) || null;
    const recebimentos = porDia.get(dia) || 0;
    const faixa = faixaDoDia(recebimentos, meta, campos);
    return {
      dia,
      recebimentos,
      // Dia sem retrato de meta (o sistema ainda não rodava) não gera bônus —
      // premiar sem saber qual era a meta seria inventar número.
      semMeta: !meta,
      metas: meta
        ? { minima: meta[campos.minima], media: meta[campos.media], maxima: meta[campos.dia] }
        : null,
      faixa,
      bonus: faixa ? valorDaFaixa[faixa] || 0 : 0,
    };
  });

  const bonusTotal = detalhe.reduce((s, d) => s + d.bonus, 0);
  return {
    userId: cfg.userId,
    nome: cfg.user.name,
    inicio: dias[0],
    fim: dias[5],
    fixo: cfg.fixoSemanal,
    bonusTotal,
    total: cfg.fixoSemanal + bonusTotal,
    diasBatidos: detalhe.filter((d) => d.faixa).length,
    tipoMeta,
    config: { bonusMinima: cfg.bonusMinima, bonusMedia: cfg.bonusMedia, bonusMaxima: cfg.bonusMaxima },
    detalhe,
  };
}

// Texto do relatório, pronto pra mandar no chat interno.
export function textoRelatorio(r) {
  const brl = (n) => "R$ " + Number(n || 0).toFixed(2).replace(".", ",");
  const dia = (d) => d.slice(8, 10) + "/" + d.slice(5, 7);
  const rotulo = { minima: "mínima", media: "média", maxima: "máxima" };
  const unidade = r.tipoMeta === "venda" ? "liberado" : "recebido";
  const num = (n) => brl(n);

  const linhas = r.detalhe.map((d) => {
    if (d.semMeta) return `  ${dia(d.dia)} — ${num(d.recebimentos)} ${unidade} (sem meta registrada)`;
    const alvo = d.metas ? ` [min ${num(d.metas.minima)} / méd ${num(d.metas.media)} / máx ${num(d.metas.maxima)}]` : "";
    if (!d.faixa) return `  ${dia(d.dia)} — ${num(d.recebimentos)} ${unidade}${alvo} · não bateu`;
    return `  ${dia(d.dia)} — ${num(d.recebimentos)} ${unidade}${alvo} · ${rotulo[d.faixa]} · +${brl(d.bonus)}`;
  });

  return [
    `💰 Acerto da semana — ${r.nome}`,
    `Período: ${dia(r.inicio)} a ${dia(r.fim)}`,
    "",
    ...linhas,
    "",
    `Fixo semanal: ${brl(r.fixo)}`,
    `Bônus (${r.diasBatidos} dia${r.diasBatidos === 1 ? "" : "s"} batido${r.diasBatidos === 1 ? "" : "s"}): ${brl(r.bonusTotal)}`,
    `TOTAL A PAGAR: ${brl(r.total)}`,
  ].join("\n");
}
