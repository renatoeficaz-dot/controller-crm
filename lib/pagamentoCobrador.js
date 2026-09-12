import { prisma } from "@/lib/prisma";
import { inicioDaSemanaTrabalho, diaComissao } from "@/lib/comissao";

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
  venda: { minima: "metaVendasMinima", media: "metaVendasMedia", dia: "metaVendasDia" },
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
    select: { paid: true, paidAt: true, valorPagoEm: true },
  });

  const porDia = new Map(dias.map((d) => [d, 0]));
  for (const p of parcelas) {
    const data = p.paid ? p.paidAt : p.valorPagoEm;
    if (!data) continue;
    const dia = diaComissao(data);
    if (porDia.has(dia)) porDia.set(dia, porDia.get(dia) + 1);
  }
  return porDia;
}

// Quantas vendas novas (lead entrou em Recebimento) em cada dia da semana —
// DA OPERAÇÃO INTEIRA, mesmo critério de "vendas do dia" usado em Metas.
async function vendasPorDia(dias) {
  const de = new Date(dias[0] + "T00:00:00.000Z");
  de.setUTCDate(de.getUTCDate() - 3); // mesmo motivo de recebimentosPorDia acima
  const ate = new Date(dias[dias.length - 1] + "T00:00:00.000Z");
  ate.setUTCDate(ate.getUTCDate() + 2);

  const contatos = await prisma.contact.findMany({
    where: { entrouRecebimentoEm: { gte: de, lt: ate }, valorCapital: { gt: 0 } },
    select: { entrouRecebimentoEm: true },
  });

  const porDia = new Map(dias.map((d) => [d, 0]));
  for (const c of contatos) {
    if (!c.entrouRecebimentoEm) continue;
    const dia = diaComissao(c.entrouRecebimentoEm);
    if (porDia.has(dia)) porDia.set(dia, porDia.get(dia) + 1);
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
  const unidade = r.tipoMeta === "venda" ? "venda(s)" : "receb.";

  const linhas = r.detalhe.map((d) => {
    if (d.semMeta) return `  ${dia(d.dia)} — ${d.recebimentos} ${unidade} (sem meta registrada)`;
    const alvo = d.metas ? ` [min ${d.metas.minima} / méd ${d.metas.media} / máx ${d.metas.maxima}]` : "";
    if (!d.faixa) return `  ${dia(d.dia)} — ${d.recebimentos} ${unidade}${alvo} · não bateu`;
    return `  ${dia(d.dia)} — ${d.recebimentos} ${unidade}${alvo} · ${rotulo[d.faixa]} · +${brl(d.bonus)}`;
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
