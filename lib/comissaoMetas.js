import { prisma } from "@/lib/prisma";
import { serieDeDias, metasDoDia, hojeStr } from "@/lib/metas";
import { diasDaSemanaTrabalho } from "@/lib/pagamentoCobrador";

// Comissão escalonada por metas (ver ComissaoMetasConfig). Em cada dia, DUAS metas da operação inteira valem pontos:
//  • recebimento (R$ recebido sem juros × meta do dia em R$) e • liberação (capital liberado × meta do dia em R$).
// Cada uma rende o % da faixa em que caiu (mínima / média / máxima, 1/2/3% por padrão). Os dois % se somam e incidem sobre o
// recebimento do dia: máximo 3% + 3% = 6%. A semana é de segunda a sábado (o fechamento é sábado às 18h, feito à parte).
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

  const detalhe = [];
  for (const dia of dias) {
    const s = porDia.get(dia) || {};
    // Dia de hoje (ainda sem retrato) usa a meta ao vivo; os demais, o retrato do dia.
    const ao = dia === hojeChave ? await metasDoDia(dia).catch(() => null) : null;
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
    const recebido = s.recebimentos || 0;
    const liberado = s.liberado || 0;
    const conta = dia >= desde;
    const faixaRec = conta ? faixaDe(recebido, metaRec.minima, metaRec.media, metaRec.maxima) : null;
    const faixaLib = conta ? faixaDe(liberado, metaLib.minima, metaLib.media, metaLib.maxima) : null;
    const pctRec = faixaRec ? pctDaFaixa[faixaRec] : 0;
    const pctLib = faixaLib ? pctDaFaixa[faixaLib] : 0;
    detalhe.push({
      dia,
      conta, // false = antes do início da comissão
      recebido: r2(recebido),
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
