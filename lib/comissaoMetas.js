import { prisma } from "@/lib/prisma";
import { serieDeDias, metasDoDia, hojeStr, recebidosNoPeriodo, somarDias, limiteDiaBrasil } from "@/lib/metas";
import { diasDaSemanaTrabalho } from "@/lib/pagamentoCobrador";
import { diaComissao } from "@/lib/comissao";

// Comissão escalonada por metas (ver ComissaoMetasConfig). Em cada dia, DUAS metas da operação inteira valem pontos:
//  • recebimento (R$ que entrou no dia × meta do dia em R$) e • liberação (capital liberado × meta do dia em R$).
// Cada uma rende o % da faixa em que caiu (mínima / média / máxima, 1/2/3% por padrão). Os dois % se somam e incidem sobre o
// recebimento do dia: máximo 3% + 3% = 6%. A semana é de segunda a sábado e fecha no sábado às 17h: o que entra (recebido ou liberado)
// DEPOIS do fechamento conta na segunda-feira da semana seguinte — o mesmo corte (diaComissao) dos relatórios dos cobradores. As faixas
// (metas) de cada dia continuam sendo as do dia do calendário, iguais às da tela de Metas.
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function faixaDe(valor, minima, media, maxima) {
  if (maxima && valor >= maxima) return "maxima";
  if (media && valor >= media) return "media";
  if (minima && valor >= minima) return "minima";
  return null;
}

export async function calcularComissaoMetas(userId, hoje = new Date()) {
  const cfg = await prisma.comissaoMetasConfig.findUnique({
    where: { userId },
    include: { user: { select: { id: true, name: true } } },
  });
  if (!cfg || !cfg.ativo) return null;

  const dias = diasDaSemanaTrabalho(hoje);
  const desde = cfg.desde.toISOString().slice(0, 10);
  const pctDaFaixa = { minima: cfg.pctMinima, media: cfg.pctMedia, maxima: cfg.pctMaxima };
  const serie = await serieDeDias(dias[0], dias[dias.length - 1]);
  const porDia = new Map(serie.map((d) => [d.dia, d]));
  const hojeChave = hojeStr();

  // Recebido e liberado de cada DIA DE COMISSÃO. Janela começa no sábado anterior: o que entrou nele depois das 17h cai na segunda desta
  // semana; o sábado desta semana depois das 17h sai daqui (vai pra segunda da próxima).
  const sabadoAnterior = somarDias(dias[0], -2);
  const fimJanela = dias[dias.length - 1];
  const [{ itens }, liberacoes] = await Promise.all([
    recebidosNoPeriodo(sabadoAnterior, fimJanela),
    prisma.lancamento.findMany({
      where: { type: "saida", description: { startsWith: "Liberação de capital" }, createdAt: { gte: limiteDiaBrasil(sabadoAnterior), lt: limiteDiaBrasil(somarDias(fimJanela, 1)) } },
      select: { amount: true, createdAt: true },
    }),
  ]);
  const recebidoCom = new Map();
  for (const it of itens) for (const pt of it.partes || []) recebidoCom.set(diaComissao(pt.hora), (recebidoCom.get(diaComissao(pt.hora)) || 0) + pt.valor);
  const liberadoCom = new Map();
  for (const l of liberacoes) liberadoCom.set(diaComissao(l.createdAt), (liberadoCom.get(diaComissao(l.createdAt)) || 0) + (l.amount || 0));

  const detalhe = [];
  for (const dia of dias) {
    const s = porDia.get(dia) || {};
    // Todos os dias da semana usam a meta configurada AGORA (ajustar a meta no meio da semana vale para a semana toda), com a base de
    // parcelas de cada dia; dias futuros não têm o que comparar.
    const ao = dia <= hojeChave ? await metasDoDia(dia, null, null, true).catch(() => null) : null;
    const metaRec = {
      minima: ao?.metaRecebimentosMinima ?? s.metaRecebimentosMinima ?? 0,
      media: ao?.metaRecebimentosMedia ?? s.metaRecebimentosMedia ?? 0,
      maxima: ao?.metaRecebimentosDia ?? s.metaRecebimentosDia ?? 0,
    };
    const metaLib = {
      minima: ao?.metaLiberacaoMinima ?? s.metaLiberacaoMinima ?? 0,
      media: ao?.metaLiberacaoMedia ?? s.metaLiberacaoMedia ?? 0,
      maxima: ao?.metaLiberacaoDia ?? s.metaLiberacaoDia ?? 0,
    };
    const recebido = r2(recebidoCom.get(dia) || 0);
    const liberado = r2(liberadoCom.get(dia) || 0);
    const conta = dia >= desde;
    const faixaRec = conta ? faixaDe(recebido, metaRec.minima, metaRec.media, metaRec.maxima) : null;
    const faixaLib = conta ? faixaDe(liberado, metaLib.minima, metaLib.media, metaLib.maxima) : null;
    const pctRec = faixaRec ? pctDaFaixa[faixaRec] : 0;
    const pctLib = faixaLib ? pctDaFaixa[faixaLib] : 0;
    detalhe.push({
      dia,
      conta, // false = antes do início da comissão
      recebido: r2(recebido),
      // Quanto o corte de sábado 17h mexeu neste dia em relação ao dia do calendário (Metas): negativo no sábado (o que passou das 17h foi
      // pra segunda), positivo na segunda (veio do sábado anterior).
      ajusteRec: r2(recebido - (s.recebimentos || 0)),
      ajusteLib: r2(liberado - (s.liberado || 0)),
      metaRec,
      faixaRec,
      pctRec,
      liberado: r2(liberado),
      metaLib,
      faixaLib,
      pctLib,
      pctTotal: pctRec + pctLib,
      comissao: conta ? r2((recebido * (pctRec + pctLib)) / 100) : 0,
    });
  }

  const hojeDet = detalhe.find((d) => d.dia === hojeChave) || null;
  return {
    userId: cfg.userId,
    nome: cfg.user.name,
    desde,
    inicio: dias[0],
    fim: dias[dias.length - 1],
    pcts: pctDaFaixa,
    maxPct: (Math.max(cfg.pctMinima, cfg.pctMedia, cfg.pctMaxima) || 0) * 2,
    hoje: hojeDet,
    totalSemana: r2(detalhe.reduce((t, d) => t + d.comissao, 0)),
    recebidoSemana: r2(detalhe.filter((d) => d.conta).reduce((t, d) => t + d.recebido, 0)),
    detalhe,
  };
}
