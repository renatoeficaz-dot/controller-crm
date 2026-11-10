import { prisma } from "@/lib/prisma";
import { serieDeDias, metasDoDia, hojeStr, recebidosNoPeriodo, somarDias, limiteDiaBrasil } from "@/lib/metas";
import { diasDaSemanaTrabalho } from "@/lib/pagamentoCobrador";
const diaLocal = (d) => new Date(d).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

// Comissão escalonada por metas (ver ComissaoMetasConfig). Em cada dia, DUAS metas da operação inteira valem pontos:
//  • recebimento (R$ que entrou no dia × meta do dia em R$) e • liberação (capital liberado × meta do dia em R$).
// Cada uma rende o % da faixa em que caiu (mínima / média / máxima, 1/2/3% por padrão). Os dois % se somam e incidem sobre o
// recebimento: máximo 3% + 3% = 6%. A semana é de segunda a sábado. Regras do Renato (10/11/2026):
//  • A FAIXA (o %) sai SÓ do que entrou no próprio dia do calendário — recebido e liberado iguais aos da tela de Metas.
//  • O VALOR sobre o qual o % incide é o recebido do "dia de comissão": o que entra sábado depois das 17h e no domingo soma na segunda
//    seguinte (só no valor, nunca para bater meta).
//  • Liberado conta apenas o do dia (não soma sábado nem domingo).
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Dia da comissão (só para o VALOR do recebido): sábado a partir das 17h e domingo viram a segunda seguinte; o resto é o dia do calendário.
export function diaComissaoMetas(d) {
  const dt = new Date(d);
  const dia = diaLocal(dt);
  const dow = new Date(dia + "T00:00:00.000Z").getUTCDay();
  if (dow === 0) return somarDias(dia, 1);
  if (dow === 6 && Number(dt.toLocaleString("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" })) >= 17) return somarDias(dia, 2);
  return dia;
}

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

  // Janela desde o sábado anterior (o que entrou nele depois das 17h e no domingo soma no valor da segunda desta semana).
  const sabadoAnterior = somarDias(dias[0], -2);
  const fimJanela = dias[dias.length - 1];
  const [{ itens }, liberacoes] = await Promise.all([
    recebidosNoPeriodo(sabadoAnterior, fimJanela),
    prisma.lancamento.findMany({
      where: { type: "saida", description: { startsWith: "Liberação de capital" }, createdAt: { gte: limiteDiaBrasil(dias[0]), lt: limiteDiaBrasil(somarDias(fimJanela, 1)) } },
      select: { amount: true, createdAt: true },
    }),
  ]);
  const soma = (mapa, dia, v) => mapa.set(dia, (mapa.get(dia) || 0) + v);
  const recebidoDoDia = new Map(); // dia do calendário → decide a faixa
  const recebidoValor = new Map(); // dia de comissão → valor sobre o qual o % incide
  for (const it of itens) for (const pt of it.partes || []) {
    soma(recebidoDoDia, diaLocal(pt.hora), pt.valor);
    soma(recebidoValor, diaComissaoMetas(pt.hora), pt.valor);
  }
  const liberadoDoDia = new Map();
  for (const l of liberacoes) soma(liberadoDoDia, diaLocal(l.createdAt), l.amount || 0);

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
    const recebidoDia = r2(recebidoDoDia.get(dia) || 0);
    const recebido = r2(recebidoValor.get(dia) || 0);
    const liberado = r2(liberadoDoDia.get(dia) || 0);
    const conta = dia >= desde;
    const faixaRec = conta ? faixaDe(recebidoDia, metaRec.minima, metaRec.media, metaRec.maxima) : null;
    const faixaLib = conta ? faixaDe(liberado, metaLib.minima, metaLib.media, metaLib.maxima) : null;
    const pctRec = faixaRec ? pctDaFaixa[faixaRec] : 0;
    const pctLib = faixaLib ? pctDaFaixa[faixaLib] : 0;
    detalhe.push({
      dia,
      conta, // false = antes do início da comissão
      recebidoDia, // o do dia do calendário (igual ao Metas): é o que decide a faixa
      recebido, // valor sobre o qual o % incide
      // Diferença entre o valor e o do dia: + na segunda (sábado depois das 17h e domingo), − no sábado (o que passou das 17h).
      ajusteRec: r2(recebido - recebidoDia),
      ajusteLib: 0,
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
