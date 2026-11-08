import { prisma } from "@/lib/prisma";
import {
  diaLocal, hojeStr, somarDias, chaveDia, limiteDiaBrasil, ehDiaUtil, diasDoMes,
  resultadoDoDia, metasDoDia, serieDeDias, recebidosNoPeriodo, whereCarteiraRecebimento, contarRenovacoesDoDia,
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
  const metaLib = doMes.filter((d) => d.diaUtil).reduce((s, d) => s + (d.metaLiberacaoDia || 0), 0);
  // A % compara o realizado com a meta dos MESMOS dias: liberação só dos dias úteis (domingo não tem meta) e recebimento só dos dias úteis
  // com meta registrada. Somar o realizado de todos os dias contra a meta de alguns inflava a %.
  const liberadoUteis = doMes.filter((d) => d.diaUtil).reduce((s, d) => s + (d.liberado || 0), 0);
  const recebidoComMeta = comMeta.reduce((s, d) => s + (d.recebimentos || 0), 0);
  const metaReceb = comMeta.reduce((s, d) => s + (d.metaRecebimentosDia || 0), 0);
  const metaRecup = comMeta.reduce((s, d) => s + (d.metaRecuperacaoDia || 0), 0);
  const metaRenov = comMeta.reduce((s, d) => s + (d.metaRenovacaoDia || 0), 0);

  return {
    diasCorridos: doMes.length,
    diasUteisCorridos: doMes.filter((d) => d.diaUtil).length,
    diasComMeta: comMeta.length,
    vendas: somar("vendas"),
    valorVendido: r2(somar("valorVendido")),
    baixas: somar("baixas"),
    valorRecebido: r2(somar("valorRecebido")),
    valorRecuperado: r2(somar("valorRecuperado")),
    renovacoes: somar("renovacoes"),
    metaVendas,
    liberado: r2(somar("liberado")),
    liberadoUteis: r2(liberadoUteis),
    metaLiberacao: r2(metaLib),
    pctLiberacao: metaLib > 0 ? Math.round((liberadoUteis / metaLib) * 100) : null,
    recebimentosComMeta: r2(recebidoComMeta),
    metaRecebimentos: r2(metaReceb),
    pctRecebimentos: metaReceb > 0 ? Math.round((recebidoComMeta / metaReceb) * 100) : null,
    metaRecuperacao: r2(metaRecup),
    metaRenovacao: metaRenov,
    pctVendas: metaVendas > 0 ? Math.round((somar("vendas") / metaVendas) * 100) : null,
    pctRecuperacao: metaRecup > 0 ? Math.round((somar("valorRecuperado") / metaRecup) * 100) : null,
    pctRenovacao: metaRenov > 0 ? Math.round((somar("renovacoes") / metaRenov) * 100) : null,
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
    // A operação vai ~08:00 às 18:00 (sábado até 17:00, o fechamento). Antes de 15% do expediente não projeta: dividir pela fração de
    // poucos minutos transformava R$ 800 às 08:05 numa projeção de R$ 96 mil. Depois do fim o dia é o que é.
    const agora = new Date();
    const minutos = agora.getHours() * 60 + agora.getMinutes();
    const inicio = 8 * 60;
    const fim = (chaveDia(hoje).getUTCDay() === 6 ? 17 : 18) * 60;
    const fracaoMinima = 0.15;
    if (minutos > inicio && minutos < fim && (minutos - inicio) / (fim - inicio) >= fracaoMinima) {
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
  // O dia de hoje ainda está em andamento: contá-lo como dia inteiro (com o dinheiro parcial) puxava a média diária pra baixo.
  const uteisCorridos = mes.diasUteisCorridos - (dia === hoje && ehDiaUtil(dia) ? 1 : 0);
  if (uteisCorridos > 0 && uteisTotais > uteisCorridos) {
    // Média só dos dias úteis FECHADOS (sem o de hoje); o realizado do mês fora de hoje = mês − hoje.
    const hojeFecha = dia === hoje && ehDiaUtil(dia) ? 1 : 0;
    const fechado = (campo, hojeVal) => (mes[campo] || 0) - (hojeFecha ? hojeVal || 0 : 0);
    const porDiaUtil = {
      vendas: fechado("vendas", real.vendas) / uteisCorridos,
      valorRecebido: fechado("valorRecebido", real.valorRecebido) / uteisCorridos,
      valorRecuperado: fechado("valorRecuperado", real.valorRecuperado) / uteisCorridos,
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

  // As metas valem em R$ (liberação e recebimento); a contagem de vendas é do sistema antigo e não é mais perseguida.
  return {
    liberacaoMinima: conta((d) => d.metaLiberacaoMinima > 0 && d.liberado >= d.metaLiberacaoMinima),
    liberacaoCheia: conta((d) => d.metaLiberacaoDia > 0 && d.liberado >= d.metaLiberacaoDia),
    recebimentosMinima: conta((d) => d.metaRecebimentosMinima != null && d.metaRecebimentosMinima > 0 && d.recebimentos >= d.metaRecebimentosMinima),
    recebimentosCheia: conta((d) => d.metaRecebimentosDia != null && d.metaRecebimentosDia > 0 && d.recebimentos >= d.metaRecebimentosDia),
    diasAvaliados: fechados.length,
  };
}

/* --------- 6. Placar por responsável ------------------------------------- */
async function placarDoDia(dia) {
  // limiteDiaBrasil, não chaveDia: filtra timestamp real de evento, precisa
  // do limite do dia brasileiro (ver limiteDiaBrasil em lib/metas.js).
  const de = limiteDiaBrasil(dia);
  const ate = limiteDiaBrasil(somarDias(dia, 1));

  const [users, vendas, recebido, stage, liberacoes] = await Promise.all([
    prisma.user.findMany({ select: { id: true, name: true, role: true } }),
    prisma.contact.findMany({
      where: { entrouRecebimentoEm: { gte: de, lt: ate }, excluidoEm: null, valorCapital: { gt: 0 }, stage: { name: { not: "Venda perdida" } } },
      select: { responsavel: true },
    }),
    // Mesma função do cartão do dia: o placar soma exatamente o que o Metas mostra.
    recebidosNoPeriodo(dia, dia),
    prisma.stage.findFirst({ where: { name: "Recebimento" } }),
    // Liberado = o que SAIU do caixa (mesma fonte do cartão): a soma da coluna fecha com o total, renovações inclusive.
    prisma.lancamento.findMany({
      where: { type: "saida", description: { startsWith: "Liberação de capital" }, createdAt: { gte: de, lt: ate } },
      select: { amount: true, contact: { select: { responsavel: true } } },
    }),
  ]);

  const carteira = stage
    ? await prisma.contact.groupBy({
        by: ["responsavel"],
        // Mesmo recorte da meta: quem foi liberado hoje ainda não paga hoje.
        where: whereCarteiraRecebimento(stage.id, dia),
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
  }
  for (const l of liberacoes) {
    garante(l.contact?.responsavel).valorVendido += l.amount || 0;
  }
  for (const it of recebido.itens) {
    const r = garante(it.baixadoPor);
    r.baixas += 1;
    r.valorRecebido += it.valor;
    if (it.atrasada) r.valorRecuperado += it.valor;
    r._clientes.add(it.contactId);
  }

  return [...mapa.values()]
    .map(({ _clientes, _count, ...r }) => ({
      ...r,
      valorVendido: r2(r.valorVendido),
      valorRecebido: r2(r.valorRecebido),
      valorRecuperado: r2(r.valorRecuperado),
      // Placar por pessoa: conta parcela baixada, não cliente distinto.
      recebimentos: r.baixas,
    }))
    // Quem não fez nada no dia e não tem carteira não precisa poluir o placar.
    .filter((r) => r.vendas || r.baixas || r.carteira || r.valorVendido)
    .sort((a, b) => b.valorRecebido - a.valorRecebido || b.vendas - a.vendas);
}

/* ------------------------------------------------------------------------ *
 * Resumo completo da tela de Metas
 * ------------------------------------------------------------------------ */
// opcoes.leve: só o que o indicador do topo e os avisos precisam (cartões do dia e níveis) — sem séries, placar, listas e projeção, que
// custam ~600 ms e eram recalculados a cada 30 s em toda aba aberta só pra mostrar três percentuais.
export async function resumoMetas(diaPedido, usuario = null, equipeMeta = null, opcoes = {}) {
  const hoje = hojeStr();
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(diaPedido || "") ? (diaPedido > hoje ? hoje : diaPedido) : hoje;
  const ehHoje = dia === hoje;
  if (opcoes.leve) {
    const [real, metas, renovacoes] = await Promise.all([
      resultadoDoDia(dia, usuario),
      metasDoDia(dia, usuario, equipeMeta),
      contarRenovacoesDoDia(dia, usuario),
    ]);
    return {
      dia, ehHoje, leve: true, usuario, ...metas,
      vendasHoje: real.vendas, valorVendidoHoje: real.valorVendido, liberadoHoje: real.liberado,
      recebimentosHoje: real.recebimentos, baixasHoje: real.baixas, valorRecebidoHoje: real.valorRecebido,
      valorRecuperadoHoje: real.valorRecuperado, clientesRecebimentoHoje: real.clientesRecebimento, renovacoesHoje: renovacoes,
      niveis: {
        vendas: nivel(real.vendas, metas.metaVendasMinima, metas.metaVendasMedia, metas.metaVendasDia),
        valorVendas: nivel(real.liberado, metas.metaValorVendasMinima, metas.metaValorVendasMedia, metas.metaValorVendasDia),
        liberacao: nivel(real.liberado, metas.metaLiberacaoMinima, metas.metaLiberacaoMedia, metas.metaLiberacaoDia),
        recebimentos: nivel(real.recebimentos, metas.metaRecebimentosMinima, metas.metaRecebimentosMedia, metas.metaRecebimentosDia),
        recuperacao: nivel(real.valorRecuperado, metas.metaRecuperacaoMinima, metas.metaRecuperacaoMedia, metas.metaRecuperacaoDia),
        renovacao: nivel(renovacoes, metas.metaRenovacaoMinima, metas.metaRenovacaoMedia, metas.metaRenovacaoDia),
      },
    };
  }

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
  //
  // limiteDiaBrasil, não chaveDia: essas duas queries filtram timestamp REAL
  // de evento (entrouRecebimentoEm, paidAt/valorPagoEm via whereRecebidoEntre)
  // pelo dia brasileiro — é exatamente a lista "Recebido" que o kbrito
  // reportava com baixa de ontem à noite (21h-23:59) aparecendo como se
  // fosse de hoje. Ver limiteDiaBrasil em lib/metas.js.
  const de = limiteDiaBrasil(dia);
  const ate = limiteDiaBrasil(somarDias(dia, 1));
  const filtroPessoa = Array.isArray(usuario) ? { in: usuario } : usuario;
  // Mesmos filtros de resultadoDoDia (lead excluído e Venda perdida fora): senão a lista mostra mais vendas do que o cartão conta.
  const whereVenda = { entrouRecebimentoEm: { gte: de, lt: ate }, excluidoEm: null, valorCapital: { gt: 0 }, stage: { name: { not: "Venda perdida" } } };
  if (usuario) whereVenda.responsavel = filtroPessoa;
  // Renovação: cliente que já estava na carteira e pegou capital de novo
  // (ciclo incrementado) — não conta como "venda" (entrouRecebimentoEm não
  // muda numa renovação, só na entrada nova), mas some sem nenhum contador
  // próprio. renovadoEm é gravado só nesse fluxo (app/api/contacts/[id]/renovar).
  const whereRenovacao = { renovadoEm: { gte: de, lt: ate } };
  if (usuario) whereRenovacao.responsavel = filtroPessoa;

  const [vendasDetalhe, recebidoDia, renovacoesDetalhe] = await Promise.all([
    prisma.contact.findMany({
      where: whereVenda,
      orderBy: { entrouRecebimentoEm: "desc" },
      select: { id: true, name: true, phone: true, valorCapital: true, entrouRecebimentoEm: true, responsavel: true },
    }),
    // A lista é feita da MESMA função do total (recebidosNoPeriodo): a soma das linhas é sempre o valor do cartão.
    recebidosNoPeriodo(dia, dia, usuario),
    prisma.contact.findMany({
      where: whereRenovacao,
      orderBy: { renovadoEm: "desc" },
      select: { id: true, name: true, phone: true, valorCapital: true, renovadoEm: true, responsavel: true, cicloAtual: true },
    }),
  ]);

  // Lista "Liberado no dia": uma linha por lançamento de saída "Liberação de capital" (a mesma fonte do total), com o valor
  // realmente liberado. Venda nova = cliente que entrou em Recebimento no dia; o resto é renovação.
  const lancLiberacao = await prisma.lancamento.findMany({
    where: { type: "saida", description: { startsWith: "Liberação de capital" }, createdAt: { gte: de, lt: ate }, ...(usuario ? { contact: { responsavel: filtroPessoa } } : {}) },
    orderBy: { createdAt: "desc" },
    select: { id: true, amount: true, createdAt: true, contactId: true, contact: { select: { name: true, phone: true, responsavel: true, cicloAtual: true, entrouRecebimentoEm: true } } },
  });
  const liberacoesDetalhe = lancLiberacao.map((l) => {
    const c = l.contact || {};
    const nova = c.entrouRecebimentoEm && c.entrouRecebimentoEm >= de && c.entrouRecebimentoEm < ate;
    return { id: l.id, contactId: l.contactId, nome: c.name, phone: c.phone, valorCapital: l.amount, hora: l.createdAt, tipo: nova ? "Venda nova" : "Renovação", responsavel: c.responsavel, cicloAtual: c.cicloAtual };
  });

  return {
    dia,
    ehHoje,
    liberacoesDetalhe,
    // Venda nova e renovação somam exatamente o liberado do dia (mesma lista do modal). Antes a venda nova vinha do valor cadastrado no
    // lead e a renovação era "total − venda nova": em 6 dos últimos 14 dias os dois números saíam R$ 100–200 errados.
    liberadoNovo: r2(liberacoesDetalhe.filter((x) => x.tipo === "Venda nova").reduce((t, x) => t + (x.valorCapital || 0), 0)),
    liberadoRenovacao: r2(liberacoesDetalhe.filter((x) => x.tipo !== "Venda nova").reduce((t, x) => t + (x.valorCapital || 0), 0)),
    usuario,
    // Sem retrato do dia, a meta de recebimento foi recalculada sobre a carteira
    // de agora — a tela avisa em vez de mostrar número que parece exato.
    baseMetaAproximada: !ehHoje && !metas.doRetrato,
    ...metas,

    // Resultado do dia
    vendasHoje: real.vendas,
    valorVendidoHoje: real.valorVendido,
    liberadoHoje: real.liberado,
    recebimentosHoje: real.recebimentos,
    baixasHoje: real.baixas,
    valorRecebidoHoje: real.valorRecebido,
    valorRecuperadoHoje: real.valorRecuperado,
    clientesRecebimentoHoje: real.clientesRecebimento,

    niveis: {
      vendas: nivel(real.vendas, metas.metaVendasMinima, metas.metaVendasMedia, metas.metaVendasDia),
      valorVendas: nivel(real.liberado, metas.metaValorVendasMinima, metas.metaValorVendasMedia, metas.metaValorVendasDia),
      liberacao: nivel(real.liberado, metas.metaLiberacaoMinima, metas.metaLiberacaoMedia, metas.metaLiberacaoDia),
      recebimentos: nivel(real.recebimentos, metas.metaRecebimentosMinima, metas.metaRecebimentosMedia, metas.metaRecebimentosDia),
      recuperacao: nivel(real.valorRecuperado, metas.metaRecuperacaoMinima, metas.metaRecuperacaoMedia, metas.metaRecuperacaoDia),
      renovacao: nivel(renovacoesDetalhe.length, metas.metaRenovacaoMinima, metas.metaRenovacaoMedia, metas.metaRenovacaoDia),
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
    renovacoesHoje: renovacoesDetalhe.length,
    renovacoesDetalhe: renovacoesDetalhe.map((c) => ({
      id: c.id, contactId: c.id, nome: c.name, phone: c.phone,
      valorCapital: c.valorCapital, renovadoEm: c.renovadoEm, responsavel: c.responsavel, cicloAtual: c.cicloAtual,
    })),
    // Capital liberado no dia = venda nova + renovação, somados — pergunta que
    // "quanto liberamos hoje" sozinho (valorVendidoHoje) não respondia, porque
    // não inclui quem renovou (entrouRecebimentoEm não muda numa renovação).
    // Mesma fonte da meta de liberação (lançamento de saída "Liberação de capital"): os dois cartões nunca mais divergem.
    valorLiberadoTotalHoje: real.liberado,
    baixasDetalhe: recebidoDia.itens.map((it) => ({
      id: it.id, contactId: it.contactId, nome: it.nome, phone: it.phone,
      parcela: it.parcela,
      valor: it.valor,
      paidAt: it.hora,
      baixadoPor: it.baixadoPor,
      atrasada: it.atrasada,
    })),
  };
}
