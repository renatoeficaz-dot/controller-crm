import { prisma } from "@/lib/prisma";

// Tudo aqui compara em data LOCAL. O banco guarda timestamps reais, então o dia
// de uma baixa é sempre derivado com toLocaleDateString — usar a data UTC faria
// a baixa da noite (UTC-3) cair no dia seguinte.
export const diaLocal = (d) => new Date(d).toLocaleDateString("en-CA");
export const hojeStr = () => new Date().toLocaleDateString("en-CA");

// "YYYY-MM-DD" -> Date de meia-noite UTC (chave usada em MetaDiaria.dia)
export const chaveDia = (dia) => new Date(dia + "T00:00:00.000Z");

export function somarDias(dia, n) {
  const d = chaveDia(dia);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Domingo é folga: a operação vende e cobra de segunda a sábado, então dia útil
// aqui exclui só domingo.
export const ehDiaUtil = (dia) => chaveDia(dia).getUTCDay() !== 0;

export function diasDoMes(dia) {
  const d = chaveDia(dia);
  const ano = d.getUTCFullYear();
  const mes = d.getUTCMonth();
  const ultimo = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return Array.from({ length: ultimo }, (_, i) =>
    new Date(Date.UTC(ano, mes, i + 1)).toISOString().slice(0, 10)
  );
}

const clamp100 = (v) => Math.min(100, Math.max(0, Number(v) || 0));
const valorPago = (p) => (p.amountPago != null ? p.amountPago : p.amount);

// Vencimento é gravado como meia-noite UTC representando o dia — então sai por
// toISOString, não por data local (que puxaria pro dia anterior em UTC-3).
// `String(date)` NÃO serve aqui: dá "Fri Jul 24 2026 ...", não ISO.
export const diaVencimento = (d) => new Date(d).toISOString().slice(0, 10);

// Uma parcela conta como RECUPERAÇÃO quando foi paga depois do vencimento —
// cobrar quem já atrasou é o esforço que a meta de recuperação mede.
export const foiRecuperacao = (p) => !!p.paidAt && diaLocal(p.paidAt) > diaVencimento(p.dueDate);

/* ------------------------------------------------------------------ *
 * Retrato do dia (MetaDiaria)
 * ------------------------------------------------------------------ */

// Grava/atualiza o retrato de hoje: metas vigentes + tamanho da carteira +
// resultado até agora. Roda a cada 5 min, então a última gravação do dia é o
// estado de fechamento.
export async function registrarMetaDoDia(hoje = hojeStr()) {
  const cfg = await prisma.config.findUnique({ where: { id: "singleton" } });
  // Item 118: dia da semana pode ter meta própria (ex.: sábado mais fraco) —
  // quando não há linha pro dia, cai na meta global de sempre.
  const diaSemana = chaveDia(hoje).getUTCDay();
  const overrideDia = await prisma.metaDiaSemana.findUnique({ where: { diaSemana } });
  const stage = await prisma.stage.findFirst({ where: { name: "Recebimento" } });

  const carteira = stage
    ? await prisma.contact.findMany({
        where: { stageId: stage.id },
        select: { responsavel: true },
      })
    : [];

  const porUsuario = {};
  for (const c of carteira) {
    const nome = c.responsavel || "— sem responsável —";
    porUsuario[nome] = (porUsuario[nome] || 0) + 1;
  }
  const totalEmRecebimento = carteira.length;

  const pctMin = clamp100(overrideDia?.metaPctRecebimentoMinima ?? cfg?.metaPctRecebimentoMinima ?? 40);
  const pctMed = clamp100(overrideDia?.metaPctRecebimentoMedia ?? cfg?.metaPctRecebimentoMedia ?? 55);
  const pctMeta = clamp100(overrideDia?.metaPctRecebimento ?? cfg?.metaPctRecebimento ?? 70);

  const real = await resultadoDoDia(hoje);

  const dados = {
    metaVendasMinima: overrideDia?.metaVendasMinima ?? cfg?.metaVendasMinima ?? 2,
    metaVendasMedia: overrideDia?.metaVendasMedia ?? cfg?.metaVendasMedia ?? 3,
    metaVendasDia: overrideDia?.metaVendasDia ?? cfg?.metaVendasDia ?? 5,
    metaPctRecebimentoMinima: pctMin,
    metaPctRecebimentoMedia: pctMed,
    metaPctRecebimento: pctMeta,
    totalEmRecebimento,
    metaRecebimentosMinima: Math.ceil((totalEmRecebimento * pctMin) / 100),
    metaRecebimentosMedia: Math.ceil((totalEmRecebimento * pctMed) / 100),
    metaRecebimentosDia: Math.ceil((totalEmRecebimento * pctMeta) / 100),
    metaValorVendasMinima: cfg?.metaValorVendasMinima ?? 0,
    metaValorVendasMedia: cfg?.metaValorVendasMedia ?? 0,
    metaValorVendasDia: cfg?.metaValorVendasDia ?? 0,
    metaRecuperacaoMinima: cfg?.metaRecuperacaoMinima ?? 0,
    metaRecuperacaoMedia: cfg?.metaRecuperacaoMedia ?? 0,
    metaRecuperacaoDia: cfg?.metaRecuperacaoDia ?? 0,
    carteiraPorUsuario: JSON.stringify(porUsuario),
    vendas: real.vendas,
    recebimentos: real.recebimentos,
    baixas: real.baixas,
    valorRecebido: real.valorRecebido,
    valorVendido: real.valorVendido,
    valorRecuperado: real.valorRecuperado,
  };

  await prisma.metaDiaria.upsert({
    where: { dia: chaveDia(hoje) },
    update: dados,
    create: { dia: chaveDia(hoje), ...dados },
  });

  return dados;
}

/* ------------------------------------------------------------------ *
 * Resultado real de um dia (sempre calculado do dado bruto — é exato)
 * ------------------------------------------------------------------ */

// usuario: null = empresa toda; string = só o que é daquela pessoa.
// Venda é do RESPONSÁVEL pelo lead; recebimento é de quem DEU A BAIXA — são
// papéis diferentes e atribuir os dois à mesma pessoa distorceria o placar.
export async function resultadoDoDia(dia, usuario = null) {
  const de = chaveDia(dia);
  const ate = chaveDia(somarDias(dia, 1));
  // usuario pode ser um nome (pessoa) ou um array de nomes (item 117: equipe).
  const filtro = Array.isArray(usuario) ? { in: usuario } : usuario;

  const whereVenda = { entrouRecebimentoEm: { gte: de, lt: ate } };
  if (usuario) whereVenda.responsavel = filtro;

  const whereBaixa = { paid: true, paidAt: { gte: de, lt: ate } };
  if (usuario) whereBaixa.baixadoPor = filtro;

  const [vendasList, parcelas] = await Promise.all([
    prisma.contact.findMany({ where: whereVenda, select: { valorCapital: true } }),
    prisma.parcela.findMany({
      where: whereBaixa,
      select: { contactId: true, amount: true, amountPago: true, paidAt: true, dueDate: true },
    }),
  ]);

  const clientes = new Set(parcelas.map((p) => p.contactId));
  let valorRecebido = 0;
  let valorRecuperado = 0;
  for (const p of parcelas) {
    const v = valorPago(p);
    valorRecebido += v;
    if (foiRecuperacao(p)) valorRecuperado += v;
  }

  return {
    vendas: vendasList.length,
    valorVendido: vendasList.reduce((s, c) => s + (c.valorCapital || 0), 0),
    recebimentos: clientes.size, // clientes DISTINTOS que pagaram
    baixas: parcelas.length,
    valorRecebido: Math.round(valorRecebido * 100) / 100,
    valorRecuperado: Math.round(valorRecuperado * 100) / 100,
  };
}

/* ------------------------------------------------------------------ *
 * Metas de um dia — do retrato quando existe, da config quando não
 * ------------------------------------------------------------------ */

// equipeMeta (item 117): metas próprias de uma equipe (mesmos campos do
// Config), com prioridade sobre a meta global quando usuario é a lista de
// membros dessa equipe. `usuario` aceita string (pessoa) ou array (equipe).
export async function metasDoDia(dia, usuario = null, equipeMeta = null) {
  const nomes = Array.isArray(usuario) ? usuario : usuario ? [usuario] : null;
  const [snap, cfg, users] = await Promise.all([
    prisma.metaDiaria.findUnique({ where: { dia: chaveDia(dia) } }),
    prisma.config.findUnique({ where: { id: "singleton" } }),
    nomes && !Array.isArray(usuario)
      ? prisma.user.findMany({
          where: { name: usuario },
          select: { metaVendasMinimaPropria: true, metaVendasMediaPropria: true, metaVendasDiaPropria: true },
        })
      : Promise.resolve([]),
  ]);

  // Carteira: do retrato do dia quando existe (é o único jeito de saber o
  // tamanho que ela tinha), senão a de agora.
  let totalEmRecebimento;
  let carteiraDoUsuario = null;
  if (snap) {
    totalEmRecebimento = snap.totalEmRecebimento;
    if (nomes) {
      const mapa = JSON.parse(snap.carteiraPorUsuario || "{}");
      carteiraDoUsuario = nomes.reduce((s, n) => s + (mapa[n] ?? 0), 0);
    }
  } else {
    const stage = await prisma.stage.findFirst({ where: { name: "Recebimento" } });
    totalEmRecebimento = stage ? await prisma.contact.count({ where: { stageId: stage.id } }) : 0;
    if (nomes && stage) {
      carteiraDoUsuario = await prisma.contact.count({ where: { stageId: stage.id, responsavel: { in: nomes } } });
    }
  }

  const pctMin = equipeMeta?.metaPctRecebimentoMinima ?? snap?.metaPctRecebimentoMinima ?? clamp100(cfg?.metaPctRecebimentoMinima ?? 40);
  const pctMed = equipeMeta?.metaPctRecebimentoMedia ?? snap?.metaPctRecebimentoMedia ?? clamp100(cfg?.metaPctRecebimentoMedia ?? 55);
  const pctMeta = equipeMeta?.metaPctRecebimento ?? snap?.metaPctRecebimento ?? clamp100(cfg?.metaPctRecebimento ?? 70);

  const base = nomes ? carteiraDoUsuario ?? 0 : totalEmRecebimento;

  // Meta de vendas: a pessoal do usuário quando ele tem as três definidas;
  // senão a da equipe quando ela tem as três definidas.
  const u = users[0];
  const temPropria =
    u && u.metaVendasMinimaPropria != null && u.metaVendasMediaPropria != null && u.metaVendasDiaPropria != null;
  const temEquipe =
    !temPropria && equipeMeta && equipeMeta.metaVendasMinima != null && equipeMeta.metaVendasMedia != null && equipeMeta.metaVendasDia != null;

  return {
    doRetrato: !!snap,
    totalEmRecebimento,
    carteiraDoUsuario,
    baseRecebimento: base,

    metaVendasMinima: temPropria ? u.metaVendasMinimaPropria : temEquipe ? equipeMeta.metaVendasMinima : snap?.metaVendasMinima ?? cfg?.metaVendasMinima ?? 2,
    metaVendasMedia: temPropria ? u.metaVendasMediaPropria : temEquipe ? equipeMeta.metaVendasMedia : snap?.metaVendasMedia ?? cfg?.metaVendasMedia ?? 3,
    metaVendasDia: temPropria ? u.metaVendasDiaPropria : temEquipe ? equipeMeta.metaVendasDia : snap?.metaVendasDia ?? cfg?.metaVendasDia ?? 5,
    metaVendasPropria: !!temPropria || !!temEquipe,

    metaPctRecebimentoMinima: pctMin,
    metaPctRecebimentoMedia: pctMed,
    metaPctRecebimento: pctMeta,
    metaRecebimentosMinima: Math.ceil((base * pctMin) / 100),
    metaRecebimentosMedia: Math.ceil((base * pctMed) / 100),
    metaRecebimentosDia: Math.ceil((base * pctMeta) / 100),

    metaValorVendasMinima: snap?.metaValorVendasMinima ?? cfg?.metaValorVendasMinima ?? 0,
    metaValorVendasMedia: snap?.metaValorVendasMedia ?? cfg?.metaValorVendasMedia ?? 0,
    metaValorVendasDia: snap?.metaValorVendasDia ?? cfg?.metaValorVendasDia ?? 0,

    metaRecuperacaoMinima: snap?.metaRecuperacaoMinima ?? cfg?.metaRecuperacaoMinima ?? 0,
    metaRecuperacaoMedia: snap?.metaRecuperacaoMedia ?? cfg?.metaRecuperacaoMedia ?? 0,
    metaRecuperacaoDia: snap?.metaRecuperacaoDia ?? cfg?.metaRecuperacaoDia ?? 0,
  };
}

/* ------------------------------------------------------------------ *
 * Série histórica — alimenta gráfico, calendário, sequência e médias
 * ------------------------------------------------------------------ */

// Resultado real de cada dia num intervalo, em uma varredura só (em vez de uma
// consulta por dia). `usuario` filtra vendas por responsável e baixas por quem
// deu a baixa.
export async function serieDeDias(diaInicio, diaFim, usuario = null, equipeMeta = null) {
  const de = chaveDia(diaInicio);
  const ate = chaveDia(somarDias(diaFim, 1));
  const nomes = Array.isArray(usuario) ? usuario : usuario ? [usuario] : null;
  const filtro = Array.isArray(usuario) ? { in: usuario } : usuario;

  const whereVenda = { entrouRecebimentoEm: { gte: de, lt: ate } };
  if (usuario) whereVenda.responsavel = filtro;
  const whereBaixa = { paid: true, paidAt: { gte: de, lt: ate } };
  if (usuario) whereBaixa.baixadoPor = filtro;

  const [vendas, parcelas, snaps] = await Promise.all([
    prisma.contact.findMany({ where: whereVenda, select: { valorCapital: true, entrouRecebimentoEm: true } }),
    prisma.parcela.findMany({
      where: whereBaixa,
      select: { contactId: true, amount: true, amountPago: true, paidAt: true, dueDate: true },
    }),
    prisma.metaDiaria.findMany({ where: { dia: { gte: de, lt: ate } } }),
  ]);

  const mapa = new Map();
  const garante = (dia) => {
    if (!mapa.has(dia)) {
      mapa.set(dia, {
        dia,
        vendas: 0,
        valorVendido: 0,
        baixas: 0,
        valorRecebido: 0,
        valorRecuperado: 0,
        _clientes: new Set(),
      });
    }
    return mapa.get(dia);
  };

  let d = diaInicio;
  while (d <= diaFim) { garante(d); d = somarDias(d, 1); }

  for (const v of vendas) {
    const r = garante(diaLocal(v.entrouRecebimentoEm));
    r.vendas += 1;
    r.valorVendido += v.valorCapital || 0;
  }
  for (const p of parcelas) {
    const r = garante(diaLocal(p.paidAt));
    r.baixas += 1;
    const val = valorPago(p);
    r.valorRecebido += val;
    if (foiRecuperacao(p)) r.valorRecuperado += val;
    r._clientes.add(p.contactId);
  }

  const porSnap = new Map(snaps.map((s) => [s.dia.toISOString().slice(0, 10), s]));

  return [...mapa.values()]
    .filter((r) => r.dia >= diaInicio && r.dia <= diaFim)
    .sort((a, b) => a.dia.localeCompare(b.dia))
    .map((r) => {
      const snap = porSnap.get(r.dia);
      const base = nomes && snap
        ? nomes.reduce((s, n) => s + (JSON.parse(snap.carteiraPorUsuario || "{}")[n] ?? 0), 0)
        : snap?.totalEmRecebimento ?? 0;
      const pct = equipeMeta?.metaPctRecebimento ?? snap?.metaPctRecebimento ?? 0;
      return {
        dia: r.dia,
        diaUtil: ehDiaUtil(r.dia),
        vendas: r.vendas,
        valorVendido: Math.round(r.valorVendido * 100) / 100,
        recebimentos: r._clientes.size,
        baixas: r.baixas,
        valorRecebido: Math.round(r.valorRecebido * 100) / 100,
        valorRecuperado: Math.round(r.valorRecuperado * 100) / 100,
        // Metas do dia só existem onde houve retrato — dia anterior à
        // funcionalidade fica sem meta em vez de inventar uma.
        temMeta: !!snap,
        metaVendasMinima: equipeMeta?.metaVendasMinima ?? snap?.metaVendasMinima ?? null,
        metaVendasMedia: equipeMeta?.metaVendasMedia ?? snap?.metaVendasMedia ?? null,
        metaVendasDia: equipeMeta?.metaVendasDia ?? snap?.metaVendasDia ?? null,
        metaRecebimentosMinima: snap ? Math.ceil((base * (equipeMeta?.metaPctRecebimentoMinima ?? snap.metaPctRecebimentoMinima ?? 0)) / 100) : null,
        metaRecebimentosMedia: snap ? Math.ceil((base * (equipeMeta?.metaPctRecebimentoMedia ?? snap.metaPctRecebimentoMedia ?? 0)) / 100) : null,
        metaRecebimentosDia: snap ? Math.ceil((base * pct) / 100) : null,
        metaRecuperacaoDia: snap?.metaRecuperacaoDia ?? null,
        metaValorVendasDia: snap?.metaValorVendasDia ?? null,
      };
    });
}
