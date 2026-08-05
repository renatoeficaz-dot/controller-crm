import { prisma } from "@/lib/prisma";
import {
  diaLocal, hojeStr, somarDias, chaveDia, ehDiaUtil, diasDoMes,
  resultadoDoDia, metasDoDia, serieDeDias, foiRecuperacao,
} from "@/lib/metas";

const r2 = (n) => Math.round((n || 0) * 100) / 100;

// Nível atingido, dos 3 configurados. Meta 0/ausente = sem meta definida.
function nivel(atual, minima, media, meta) {
  if (!meta) return null;
  if (atual >= meta) return "meta";
  if (atual >= media) return "media";
  if (atual >= minima) return "minima";
  return "abaixo";
}

/* --------- 1. Acumulado do mês, com meta acumulada dos dias já corridos --- */
async function acumuladoDoMes(dia, usuario, serieMes) {
  const hoje = hojeStr();
  const doMes = serieMes.filter((d) => d.dia <= (dia > hoje ? hoje : dia));

  const somar = (campo) => doMes.reduce((s, d) => s + (d[campo] || 0), 0);
  // A meta acumulada só soma os dias que TÊM retrato — dia sem meta gravada
  // entraria como zero e faria a meta do mês parecer menor do que foi.
  const comMeta = doMes.filter((d) => d.temMeta && d.diaUtil);
  const metaVendas = comMeta.reduce((s, d) => s + (d.metaVendasDia || 0), 0);
  const metaReceb = comMeta.reduce((s, d) => s + (d.metaRecebimentosDia || 0), 0);
  const metaRecup = comMeta.reduce((s, d) => s + (d.metaRecuperacaoDia || 0), 0);

  return {
    diasCorridos: doMes.length,
    diasUteisCorridos: doMes.filter((d) => d.diaUtil).length,
    diasComMeta: comMeta.length,
    vendas: somar("vendas"),
    valorVendido: r2(somar("valorVendido")),
    baixas: somar("baixas"),
    valorRecebido: r2(somar("valorRecebido")),
    valorRecuperado: r2(somar("valorRecuperado")),
    metaVendas,
    metaRecebimentos: metaReceb,
    metaRecuperacao: r2(metaRecup),
    pctVendas: metaVendas > 0 ? Math.round((somar("vendas") / metaVendas) * 100) : null,
    pctRecuperacao: metaRecup > 0 ? Math.round((somar("valorRecuperado") / metaRecup) * 100) : null,
  };
}

/* --------- 7. Média do MESMO dia da semana (4 últimas ocorrências) -------- */
async function mediaMesmoDiaSemana(dia, usuario) {
  const dow = chaveDia(dia).getUTCDay();
  const dias = [];
  let d = somarDias(dia, -7);
  while (dias.length < 4) {
    dias.push(d);
    d = somarDias(d, -7);
  }
  const serie = await serieDeDias(dias[dias.length - 1], dias[0], usuario);
  const so = serie.filter((s) => dias.includes(s.dia));
  if (!so.length) return null;
  const med = (campo) => r2(so.reduce((s, x) => s + (x[campo] || 0), 0) / so.length);
  return {
    diaSemana: dow,
    amostras: so.length,
    vendas: med("vendas"),
    valorRecebido: med("valorRecebido"),
    valorRecuperado: med("valorRecuperado"),
    dias: so.map((x) => x.dia),
  };
}

/* --------- 8. Projeção do dia (pelo horário) e do mês (dias úteis) -------- */
function projecao(dia, real, mes, serieMes) {
  const hoje = hojeStr();
  const out = { dia: null, mes: null };

  if (dia === hoje) {
    // A operação vai ~08:00 às 18:00. Antes das 8 não projeta (amostra pequena
    // demais viraria número fantasioso); depois das 18 o dia é o que é.
    const agora = new Date();
    const minutos = agora.getHours() * 60 + agora.getMinutes();
    const inicio = 8 * 60;
    const fim = 18 * 60;
    if (minutos > inicio && minutos < fim) {
      const fracao = (minutos - inicio) / (fim - inicio);
      out.dia = {
        fracaoDoDia: Math.round(fracao * 100),
        vendas: Math.round(real.vendas / fracao),
        valorRecebido: r2(real.valorRecebido / fracao),
        valorRecuperado: r2(real.valorRecuperado / fracao),
      };
    }
  }

  const uteisTotais = diasDoMes(dia).filter(ehDiaUtil).length;
  const uteisCorridos = mes.diasUteisCorridos;
  if (uteisCorridos > 0 && uteisTotais > uteisCorridos) {
    const porDiaUtil = {
      vendas: mes.vendas / uteisCorridos,
      valorRecebido: mes.valorRecebido / uteisCorridos,
      valorRecuperado: mes.valorRecuperado / uteisCorridos,
    };
    out.mes = {
      diasUteisTotais: uteisTotais,
      diasUteisCorridos: uteisCorridos,
      diasUteisRestantes: uteisTotais - uteisCorridos,
      vendas: Math.round(porDiaUtil.vendas * uteisTotais),
      valorRecebido: r2(porDiaUtil.valorRecebido * uteisTotais),
      valorRecuperado: r2(porDiaUtil.valorRecuperado * uteisTotais),
    };
  }
  return out;
}

/* --------- 10. Sequência de dias batendo a meta -------------------------- */
// Conta pra trás a partir do último dia útil FECHADO — o dia de hoje ainda
// pode bater, então incluí-lo zeraria a sequência toda manhã.
function sequencia(serie, dia) {
  const hoje = hojeStr();
  const fechados = serie
    .filter((d) => d.diaUtil && d.temMeta && d.dia < (dia > hoje ? hoje : dia))
    .sort((a, b) => b.dia.localeCompare(a.dia));

  const conta = (ok) => {
    let n = 0;
    for (const d of fechados) {
      if (!ok(d)) break;
      n++;
    }
    return n;
  };

  return {
    vendasMinima: conta((d) => d.metaVendasMinima != null && d.vendas >= d.metaVendasMinima),
    vendasCheia: conta((d) => d.metaVendasDia != null && d.vendas >= d.metaVendasDia),
    recebimentosMinima: conta((d) => d.metaRecebimentosMinima != null && d.recebimentos >= d.metaRecebimentosMinima),
    diasAvaliados: fechados.length,
  };
}

/* --------- 6. Placar por responsável ------------------------------------- */
async function placarDoDia(dia) {
  const de = chaveDia(dia);
  const ate = chaveDia(somarDias(dia, 1));

  const [users, vendas, parcelas, stage] = await Promise.all([
    prisma.user.findMany({ select: { id: true, name: true, role: true } }),
    prisma.contact.findMany({
      where: { entrouRecebimentoEm: { gte: de, lt: ate }, excluidoEm: null },
      select: { responsavel: true, valorCapital: true },
    }),
    prisma.parcela.findMany({
      where: { paid: true, paidAt: { gte: de, lt: ate } },
      select: { baixadoPor: true, contactId: true, amount: true, amountPago: true, paidAt: true, dueDate: true },
    }),
    prisma.stage.findFirst({ where: { name: "Recebimento" } }),
  ]);

  const carteira = stage
    ? await prisma.contact.groupBy({
        by: ["responsavel"],
        where: { stageId: stage.id, excluidoEm: null },
        _count: { _all: true },
      })
    : [];

  const mapa = new Map();
  const garante = (nome) => {
    const chave = nome || "— sem responsável —";
    if (!mapa.has(chave)) {
      mapa.set(chave, {
        nome: chave,
        vendas: 0, valorVendido: 0,
        baixas: 0, valorRecebido: 0, valorRecuperado: 0,
        carteira: 0,
        _clientes: new Set(),
      });
    }
    return mapa.get(chave);
  };

  // Só cria linha pra quem é da equipe; quem aparecer nos dados sem cadastro
  // (usuário excluído, por exemplo) entra também, pra não sumir movimento.
  for (const u of users) garante(u.name);
  for (const c of carteira) garante(c.responsavel)._count = 0;
  for (const c of carteira) garante(c.responsavel).carteira = c._count._all;

  for (const v of vendas) {
    const r = garante(v.responsavel);
    r.vendas += 1;
    r.valorVendido += v.valorCapital || 0;
  }
  for (const p of parcelas) {
    const r = garante(p.baixadoPor);
    r.baixas += 1;
    const val = p.amountPago != null ? p.amountPago : p.amount;
    r.valorRecebido += val;
    if (foiRecuperacao(p)) r.valorRecuperado += val;
    r._clientes.add(p.contactId);
  }

  return [...mapa.values()]
    .map(({ _clientes, _count, ...r }) => ({
      ...r,
      valorVendido: r2(r.valorVendido),
      valorRecebido: r2(r.valorRecebido),
      valorRecuperado: r2(r.valorRecuperado),
      recebimentos: _clientes.size,
    }))
    // Quem não fez nada no dia e não tem carteira não precisa poluir o placar.
    .filter((r) => r.vendas || r.baixas || r.carteira)
    .sort((a, b) => b.valorRecebido - a.valorRecebido || b.vendas - a.vendas);
}

/* ------------------------------------------------------------------------ *
 * Resumo completo da tela de Metas
 * ------------------------------------------------------------------------ */
export async function resumoMetas(diaPedido, usuario = null, equipeMeta = null) {
  const hoje = hojeStr();
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(diaPedido || "") ? (diaPedido > hoje ? hoje : diaPedido) : hoje;
  const ehHoje = dia === hoje;

  const diasMes = diasDoMes(dia);
  const [real, metas, serie30, serieMes, placar, media] = await Promise.all([
    resultadoDoDia(dia, usuario),
    metasDoDia(dia, usuario, equipeMeta),
    serieDeDias(somarDias(dia, -29), dia, usuario, equipeMeta),
    serieDeDias(diasMes[0], diasMes[diasMes.length - 1], usuario, equipeMeta),
    usuario ? Promise.resolve(null) : placarDoDia(dia),
    mediaMesmoDiaSemana(dia, usuario),
  ]);

  const mes = await acumuladoDoMes(dia, usuario, serieMes);

  // Detalhe do dia (listas dos modais) — usuario pode ser nome ou array (equipe)
  const de = chaveDia(dia);
  const ate = chaveDia(somarDias(dia, 1));
  const filtroPessoa = Array.isArray(usuario) ? { in: usuario } : usuario;
  const whereVenda = { entrouRecebimentoEm: { gte: de, lt: ate } };
  if (usuario) whereVenda.responsavel = filtroPessoa;
  const whereBaixa = { paid: true, paidAt: { gte: de, lt: ate } };
  if (usuario) whereBaixa.baixadoPor = filtroPessoa;

  const [vendasDetalhe, baixasDetalhe] = await Promise.all([
    prisma.contact.findMany({
      where: whereVenda,
      orderBy: { entrouRecebimentoEm: "desc" },
      select: { id: true, name: true, phone: true, valorCapital: true, entrouRecebimentoEm: true, responsavel: true },
    }),
    prisma.parcela.findMany({
      where: whereBaixa,
      orderBy: { paidAt: "desc" },
      select: {
        id: true, number: true, amount: true, amountPago: true, paidAt: true, dueDate: true, baixadoPor: true,
        contact: { select: { id: true, name: true, phone: true } },
      },
    }),
  ]);

  return {
    dia,
    ehHoje,
    usuario,
    // Sem retrato do dia, a meta de recebimento foi recalculada sobre a carteira
    // de agora — a tela avisa em vez de mostrar número que parece exato.
    baseMetaAproximada: !ehHoje && !metas.doRetrato,
    ...metas,

    // Resultado do dia
    vendasHoje: real.vendas,
    valorVendidoHoje: real.valorVendido,
    recebimentosHoje: real.recebimentos,
    baixasHoje: real.baixas,
    valorRecebidoHoje: real.valorRecebido,
    valorRecuperadoHoje: real.valorRecuperado,

    niveis: {
      vendas: nivel(real.vendas, metas.metaVendasMinima, metas.metaVendasMedia, metas.metaVendasDia),
      valorVendas: nivel(real.valorVendido, metas.metaValorVendasMinima, metas.metaValorVendasMedia, metas.metaValorVendasDia),
      recebimentos: nivel(real.recebimentos, metas.metaRecebimentosMinima, metas.metaRecebimentosMedia, metas.metaRecebimentosDia),
      recuperacao: nivel(real.valorRecuperado, metas.metaRecuperacaoMinima, metas.metaRecuperacaoMedia, metas.metaRecuperacaoDia),
    },

    mes,
    projecao: projecao(dia, real, mes, serieMes),
    sequencia: sequencia(serie30, dia),
    mediaMesmoDiaSemana: media,
    serie30,
    calendarioMes: serieMes,
    placar,

    vendasDetalhe: vendasDetalhe.map((c) => ({
      id: c.id, contactId: c.id, nome: c.name, phone: c.phone,
      valorCapital: c.valorCapital, entrouRecebimentoEm: c.entrouRecebimentoEm, responsavel: c.responsavel,
    })),
    baixasDetalhe: baixasDetalhe.map((p) => ({
      id: p.id, contactId: p.contact.id, nome: p.contact.name, phone: p.contact.phone,
      parcela: p.number,
      valor: p.amountPago != null ? p.amountPago : p.amount,
      paidAt: p.paidAt,
      baixadoPor: p.baixadoPor,
      atrasada: foiRecuperacao(p),
    })),
  };
}
