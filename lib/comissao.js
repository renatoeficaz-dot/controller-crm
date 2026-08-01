import { prisma } from "@/lib/prisma";

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

// Quanto o cobrador recuperou e quanto já tem de comissão acumulada pra receber
// no fim de semana. `nome` é o nome do usuário (Parcela.baixadoPor).
export async function resumoComissao(nome, hoje = new Date()) {
  const cfg = await prisma.comissaoConfig.findUnique({ where: { id: "singleton" } });
  const conf = cfg || { metaDiariaValor: 0, bonusDiario: 0, metaSemanalValor: 0, bonusSemanal: 0, progressivaAtiva: false, descontoPorPerdaValor: 0 };

  const chaves = diasDaSemana(hoje);
  const permitidos = new Set(chaves);

  // A janela da consulta é folgada em 1 dia de cada lado porque o filtro exato
  // é por data LOCAL, feito no JS abaixo — sem a folga, uma baixa da noite de
  // sábado (que em UTC já é domingo) ficaria de fora.
  const de = new Date(chaves[0] + "T00:00:00.000Z");
  de.setUTCDate(de.getUTCDate() - 1);
  const ate = new Date(chaves[5] + "T00:00:00.000Z");
  ate.setUTCDate(ate.getUTCDate() + 2);

  const baixas = await prisma.parcela.findMany({
    where: { paid: true, baixadoPor: nome, paidAt: { gte: de, lt: ate } },
    select: { amountPago: true, amount: true, paidAt: true },
  });

  const valorDe = (p) => (p.amountPago != null ? p.amountPago : p.amount);

  const porDia = new Map();
  for (const p of baixas) {
    if (!p.paidAt) continue;
    const dia = diaLocal(p.paidAt);
    if (!permitidos.has(dia)) continue; // caiu na folga da janela, fora da semana
    porDia.set(dia, (porDia.get(dia) || 0) + valorDe(p));
  }

  const dias = chaves.map((dia) => {
    const valor = porDia.get(dia) || 0;
    const bateu = conf.metaDiariaValor > 0 && valor >= conf.metaDiariaValor;
    return { dia, valor, bateu, bonus: bateu ? conf.bonusDiario : 0 };
  });

  const totalSemana = dias.reduce((s, d) => s + d.valor, 0);
  const bonusDiarios = dias.reduce((s, d) => s + d.bonus, 0);
  const bateuSemanal = conf.metaSemanalValor > 0 && totalSemana >= conf.metaSemanalValor;
  const bonusSemanalGanho = bateuSemanal ? conf.bonusSemanal : 0;

  // Item 221: bônus progressivo — pega a MAIOR faixa que o total da semana
  // alcançou e aplica o % dela sobre o total recuperado. Só entra na conta
  // se o admin ligou (progressivaAtiva); por padrão fica só informativo.
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
    const de = new Date(chaves[0] + "T00:00:00.000Z");
    const ate = new Date(chaves[5] + "T00:00:00.000Z");
    ate.setUTCDate(ate.getUTCDate() + 1);
    qtdPerdas = await prisma.contact.count({
      where: { responsavel: nome, perdidoEm: { gte: de, lt: ate } },
    });
    descontoPerdas = Math.round(qtdPerdas * conf.descontoPorPerdaValor * 100) / 100;
  }

  const hojeChave = diaLocal(hoje);
  const diaDeHoje = dias.find((d) => d.dia === hojeChave) || { valor: 0, bateu: false, bonus: 0 };

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
    hoje: { valor: diaDeHoje.valor, bateu: diaDeHoje.bateu, bonus: diaDeHoje.bonus },
    dias,
    totalSemana,
    diasBatidos: dias.filter((d) => d.bateu).length,
    bonusDiarios,
    bateuSemanal,
    bonusSemanal: bonusSemanalGanho,
    bonusProgressivo,
    faixaAtingida: faixaAtingida ? { minValor: faixaAtingida.minValor, pctBonus: faixaAtingida.pctBonus } : null,
    progressivaAtiva: !!conf.progressivaAtiva,
    qtdPerdas,
    descontoPerdas,
    // O que ele já garantiu pra receber no fim de semana. O bônus progressivo
    // só entra aqui se o admin ligou; o desconto por perda só existe se o
    // admin configurou um valor (> 0) — os dois seguem opt-in.
    totalAReceber: Math.max(
      0,
      bonusDiarios + bonusSemanalGanho + (conf.progressivaAtiva ? bonusProgressivo : 0) - descontoPerdas
    ),
    faltaSemanal: bateuSemanal ? 0 : Math.max(0, conf.metaSemanalValor - totalSemana),
    faltaHoje: diaDeHoje.bateu ? 0 : Math.max(0, conf.metaDiariaValor - diaDeHoje.valor),
  };
}
