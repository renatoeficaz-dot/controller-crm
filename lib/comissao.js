import { prisma } from "@/lib/prisma";
import { whereRecebidoEntre, valorRecebidoDe } from "@/lib/finance";

// Data local no formato "YYYY-MM-DD". Tudo aqui é comparado em data LOCAL, não
// UTC: depois das 21h (Brasil, UTC-3) o dia UTC já virou, e agrupar por UTC
// jogaria a baixa da noite no dia seguinte — o cobrador veria o total errado.
const diaLocal = (d) => new Date(d).toLocaleDateString("en-CA");

// A semana de trabalho da cobrança é SEGUNDA a SÁBADO — domingo é folga e não
// entra na conta. O acerto da comissão é no fim de semana.
export function inicioDaSemanaTrabalho(hoje = new Date()) {
  const d = new Date(diaLocal(hoje) + "T00:00:00.000Z");
  const dow = d.getUTCDay(); // 0 = domingo, 1 = segunda ... 6 = sábado
  // No domingo, a semana de referência é a que acabou de fechar (segunda anterior).
  const voltar = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - voltar);
  return d;
}

export function fimDaSemanaTrabalho(hoje = new Date()) {
  const inicio = inicioDaSemanaTrabalho(hoje);
  const fim = new Date(inicio);
  fim.setUTCDate(fim.getUTCDate() + 6); // domingo seguinte (exclusivo)
  return fim;
}

// Os 6 dias úteis da semana (seg..sáb) como strings de data local.
function diasDaSemana(hoje = new Date()) {
  const ini = inicioDaSemanaTrabalho(hoje);
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(ini);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

// Métricas de comissão por colaborador, além da "recuperacao" (que também
// tem meta GLOBAL em ComissaoConfig, servindo de fallback).
export const METRICAS_COMISSAO = ["analise", "recebimento", "recuperacao", "juros", "cravo"];

// Agrupa uma lista de itens (com data e valor já resolvidos) nos 6 dias da
// semana de trabalho, e monta o mesmo formato de resumo pra qualquer métrica
// (contagem ou R$ — quem chama decide o que "valor" significa).
function montarResumoMetrica(itens, chaves, permitidos, meta) {
  const porDia = new Map();
  for (const it of itens) {
    const dia = diaLocal(it.data);
    if (!permitidos.has(dia)) continue;
    porDia.set(dia, (porDia.get(dia) || 0) + it.valor);
  }
  const dias = chaves.map((dia) => {
    const valor = porDia.get(dia) || 0;
    const bateu = meta.metaDiaria > 0 && valor >= meta.metaDiaria;
    return { dia, valor, bateu, bonus: bateu ? meta.bonusDiario : 0 };
  });
  const totalSemana = dias.reduce((s, d) => s + d.valor, 0);
  const bonusDiarios = dias.reduce((s, d) => s + d.bonus, 0);
  const bateuSemanal = meta.metaSemanal > 0 && totalSemana >= meta.metaSemanal;
  const bonusSemanalGanho = bateuSemanal ? meta.bonusSemanal : 0;
  const hojeChave = diaLocal(new Date());
  const diaDeHoje = dias.find((d) => d.dia === hojeChave) || { valor: 0, bateu: false, bonus: 0 };

  return {
    config: meta,
    dias,
    totalSemana,
    diasBatidos: dias.filter((d) => d.bateu).length,
    bonusDiarios,
    bateuSemanal,
    bonusSemanal: bonusSemanalGanho,
    totalAReceber: bonusDiarios + bonusSemanalGanho,
    hoje: { valor: diaDeHoje.valor, bateu: diaDeHoje.bateu, bonus: diaDeHoje.bonus },
    faltaSemanal: bateuSemanal ? 0 : Math.max(0, meta.metaSemanal - totalSemana),
    faltaHoje: diaDeHoje.bateu ? 0 : Math.max(0, meta.metaDiaria - diaDeHoje.valor),
  };
}

// Quanto o cobrador recuperou e quanto já tem de comissão acumulada pra receber
// no fim de semana. `nome` é o nome do usuário (Parcela.baixadoPor / EtapaLog.usuario).
export async function resumoComissao(nome, hoje = new Date()) {
  const [cfg, user] = await Promise.all([
    prisma.comissaoConfig.findUnique({ where: { id: "singleton" } }),
    prisma.user.findFirst({ where: { name: nome }, include: { metasComissao: true } }),
  ]);
  const conf = cfg || { metaDiariaValor: 0, bonusDiario: 0, metaSemanalValor: 0, bonusSemanal: 0, progressivaAtiva: false, descontoPorPerdaValor: 0 };

  const metasPorMetrica = new Map((user?.metasComissao || []).map((m) => [m.metrica, m]));
  const metaDe = (metrica, fallback) => {
    const m = metasPorMetrica.get(metrica);
    return m
      ? { metaDiaria: m.metaDiaria, bonusDiario: m.bonusDiario, metaSemanal: m.metaSemanal, bonusSemanal: m.bonusSemanal }
      : fallback;
  };

  const chaves = diasDaSemana(hoje);
  const permitidos = new Set(chaves);

  // A janela da consulta é folgada em 1 dia de cada lado porque o filtro exato
  // é por data LOCAL, feito no JS abaixo — sem a folga, uma baixa da noite de
  // sábado (que em UTC já é domingo) ficaria de fora.
  const de = new Date(chaves[0] + "T00:00:00.000Z");
  de.setUTCDate(de.getUTCDate() - 1);
  const ate = new Date(chaves[5] + "T00:00:00.000Z");
  ate.setUTCDate(ate.getUTCDate() + 2);

  const [baixas, etapaLogs] = await Promise.all([
    prisma.parcela.findMany({
      where: { baixadoPor: nome, ...whereRecebidoEntre(de, ate) },
      select: { amountPago: true, amount: true, paid: true, valorPago: true, valorPagoEm: true, paidAt: true, contact: { select: { deuCalote: true } } },
    }),
    prisma.etapaLog.findMany({
      where: {
        usuario: nome,
        paraEtapa: { in: ["Liberação pagamento", "Recebimento"] },
        createdAt: { gte: de, lt: ate },
      },
      select: { paraEtapa: true, createdAt: true },
    }),
  ]);

  // valorRecebidoDe ja soma certo nos dois casos (completa vs parcial).
  const valorDe = (p) => valorRecebidoDe(p);
  // Parcial nao tem paidAt — a data do dinheiro e o valorPagoEm.
  const dataDe = (p) => p.paidAt || p.valorPagoEm;

  // recuperacao: R$ de toda baixa dada por esse colaborador (igual sempre foi).
  const itensRecuperacao = baixas.map((p) => ({ data: dataDe(p), valor: valorDe(p) }));
  // juros: só a parte que passou do valor normal da parcela (multa por atraso).
  const itensJuros = baixas
    .map((p) => ({ data: dataDe(p), valor: Math.max(0, valorDe(p) - p.amount) }))
    .filter((it) => it.valor > 0);
  // cravo: R$ de baixas de leads que JÁ estiveram em Cravo (deuCalote fica
  // marcado pra sempre, mesmo depois de sair de lá — ver lib/ia.js).
  const itensCravo = baixas
    .filter((p) => p.contact?.deuCalote)
    .map((p) => ({ data: dataDe(p), valor: valorDe(p) }));
  // analise: qtd de leads que esse colaborador moveu pra "Liberação pagamento".
  const itensAnalise = etapaLogs
    .filter((l) => l.paraEtapa === "Liberação pagamento")
    .map((l) => ({ data: l.createdAt, valor: 1 }));
  // recebimento: qtd de leads que esse colaborador moveu pra "Recebimento".
  const itensRecebimento = etapaLogs
    .filter((l) => l.paraEtapa === "Recebimento")
    .map((l) => ({ data: l.createdAt, valor: 1 }));

  const metricas = {
    analise: montarResumoMetrica(itensAnalise, chaves, permitidos, metaDe("analise", { metaDiaria: 0, bonusDiario: 0, metaSemanal: 0, bonusSemanal: 0 })),
    recebimento: montarResumoMetrica(itensRecebimento, chaves, permitidos, metaDe("recebimento", { metaDiaria: 0, bonusDiario: 0, metaSemanal: 0, bonusSemanal: 0 })),
    recuperacao: montarResumoMetrica(itensRecuperacao, chaves, permitidos, metaDe("recuperacao", { metaDiaria: conf.metaDiariaValor, bonusDiario: conf.bonusDiario, metaSemanal: conf.metaSemanalValor, bonusSemanal: conf.bonusSemanal })),
    juros: montarResumoMetrica(itensJuros, chaves, permitidos, metaDe("juros", { metaDiaria: 0, bonusDiario: 0, metaSemanal: 0, bonusSemanal: 0 })),
    cravo: montarResumoMetrica(itensCravo, chaves, permitidos, metaDe("cravo", { metaDiaria: 0, bonusDiario: 0, metaSemanal: 0, bonusSemanal: 0 })),
  };

  // A partir daqui, tudo é EXATAMENTE como já funcionava antes (compatível com
  // quem já lê esses campos no topo) — só que agora espelhando metricas.recuperacao.
  const r = metricas.recuperacao;
  const totalSemana = r.totalSemana;
  const dias = r.dias;

  // Item 221: bônus progressivo — pega a MAIOR faixa que o total da semana
  // (recuperação) alcançou e aplica o % dela sobre o total recuperado. Só
  // entra na conta se o admin ligou (progressivaAtiva); por padrão fica só
  // informativo.
  let bonusProgressivo = 0;
  let faixaAtingida = null;
  if (totalSemana > 0) {
    const faixas = await prisma.comissaoFaixa.findMany({ orderBy: { minValor: "asc" } });
    for (const f of faixas) {
      if (totalSemana >= f.minValor) faixaAtingida = f;
    }
    if (faixaAtingida) bonusProgressivo = Math.round(totalSemana * (faixaAtingida.pctBonus / 100) * 100) / 100;
  }

  // Item 223: desconto por lead perdido na semana, sob responsabilidade
  // desse cobrador/vendedor. 0 (padrão) = desligado.
  let qtdPerdas = 0;
  let descontoPerdas = 0;
  if (conf.descontoPorPerdaValor > 0) {
    const deP = new Date(chaves[0] + "T00:00:00.000Z");
    const ateP = new Date(chaves[5] + "T00:00:00.000Z");
    ateP.setUTCDate(ateP.getUTCDate() + 1);
    qtdPerdas = await prisma.contact.count({
      where: { responsavel: nome, perdidoEm: { gte: deP, lt: ateP } },
    });
    descontoPerdas = Math.round(qtdPerdas * conf.descontoPorPerdaValor * 100) / 100;
  }

  // Soma de TODAS as métricas (inclui as novas) — o que o colaborador já
  // garantiu de bônus no total, somando análise + recebimento + recuperação +
  // juros + cravo + progressivo, menos o desconto por perda.
  const totalGeralAReceber = Math.max(
    0,
    Object.values(metricas).reduce((s, m) => s + m.totalAReceber, 0) +
      (conf.progressivaAtiva ? bonusProgressivo : 0) -
      descontoPerdas
  );

  return {
    config: {
      metaDiariaValor: conf.metaDiariaValor,
      bonusDiario: conf.bonusDiario,
      metaSemanalValor: conf.metaSemanalValor,
      bonusSemanal: conf.bonusSemanal,
      progressivaAtiva: !!conf.progressivaAtiva,
      descontoPorPerdaValor: conf.descontoPorPerdaValor || 0,
    },
    semanaInicio: chaves[0],
    semanaFim: chaves[5],
    // No domingo (folga) não existe "hoje" na semana de trabalho — fica zerado,
    // e o que importa é o acumulado da semana que fechou.
    hoje: r.hoje,
    dias,
    totalSemana,
    diasBatidos: r.diasBatidos,
    bonusDiarios: r.bonusDiarios,
    bateuSemanal: r.bateuSemanal,
    bonusSemanal: r.bonusSemanal,
    bonusProgressivo,
    faixaAtingida: faixaAtingida ? { minValor: faixaAtingida.minValor, pctBonus: faixaAtingida.pctBonus } : null,
    progressivaAtiva: !!conf.progressivaAtiva,
    qtdPerdas,
    descontoPerdas,
    // O que ele já garantiu pra receber no fim de semana (só a métrica
    // "recuperacao" + progressivo, igual sempre foi — mantido por
    // compatibilidade com quem já lê este campo).
    totalAReceber: Math.max(
      0,
      r.bonusDiarios + r.bonusSemanal + (conf.progressivaAtiva ? bonusProgressivo : 0) - descontoPerdas
    ),
    faltaSemanal: r.faltaSemanal,
    faltaHoje: r.faltaHoje,
    // Novo: as 5 métricas (Análise, Recebimento, Recuperação, Juros, Cravo)
    // cada uma com sua própria meta/bônus diário e semanal.
    metricas,
    totalGeralAReceber,
  };
}
