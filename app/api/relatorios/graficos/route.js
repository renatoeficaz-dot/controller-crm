import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { hojeStr, recebidosNoPeriodo } from "@/lib/metas";
import {
  ultimosMeses, ultimasSemanas, inicioDoMes, carteiraPorMes, recuperacaoPorSemana, calorDiaHora, ranking, distribuicaoCiclos,
  ticketPorMes, prazoAtrasoPorMes, perdasPorMes, promessasPorUsuario, resultadoMensal,
} from "@/lib/graficosRelatorio";

// Busca em lotes (o SQLite limita as variáveis de uma consulta).
async function emLotes(ids, busca, tam = 500) {
  const out = [];
  for (let i = 0; i < ids.length; i += tam) out.push(...(await busca(ids.slice(i, i + tam))));
  return out;
}

// Dados dos gráficos do painel de Relatórios (últimos 6 meses / 12 semanas). Só admin: são números da empresa toda.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const hoje = hojeStr();
  const meses = ultimosMeses(hoje, 6);
  const semanas = ultimasSemanas(hoje, 12);
  const desde = inicioDoMes(meses[0]);
  const mesAtual = meses[meses.length - 1];

  const [cfg, logs, contatos, parcelas, rec, entradas, liberacoes, despesas, tentativas] = await Promise.all([
    prisma.config.findUnique({ where: { id: "singleton" }, select: { honorariosPct: true } }),
    prisma.etapaLog.findMany({ select: { contactId: true, paraEtapa: true, createdAt: true }, orderBy: { createdAt: "asc" } }),
    prisma.contact.findMany({ where: { excluidoEm: null }, select: { id: true, valorCapital: true, cicloAtual: true } }),
    prisma.parcela.findMany({
      where: { renegociada: false, contact: { excluidoEm: null }, OR: [{ paid: false }, { paidAt: { gte: desde } }] },
      select: { dueDate: true, amount: true, paid: true, paidAt: true, valorPago: true },
    }),
    recebidosNoPeriodo(semanas[0] < `${mesAtual}-01` ? semanas[0] : `${mesAtual}-01`, hoje),
    // Recebido dos 6 meses pela MESMA fonte das Metas (corta baixa lançada em dobro): o mapa de calor e o resultado mensal somavam os
    // lançamentos crus e saíam maiores que o recebido da tela de Metas.
    // chave = cliente + minuto (um pagamento que quitou duas parcelas conta UMA vez no mapa de calor); extra = parte que é multa
    // (o que passou do valor da parcela é lucro inteiro, não "capital + honorários").
    recebidosNoPeriodo(meses[0] + "-01", hoje).then(({ itens }) => itens.flatMap((it) => (it.partes || []).map((pt) => ({
      amount: pt.valor || 0,
      createdAt: pt.hora,
      chave: it.contactId + "|" + Math.floor(new Date(pt.hora).getTime() / 60000),
      extra: it.valor > (it.amount || 0) && it.valor > 0 ? ((it.valor - (it.amount || 0)) * (pt.valor || 0)) / it.valor : 0,
    })))),
    prisma.lancamento.findMany({
      where: { type: "saida", description: { startsWith: "Liberação de capital" }, createdAt: { gte: desde } },
      select: { amount: true, createdAt: true, contact: { select: { responsavel: true } } },
    }),
    prisma.lancamento.findMany({
      // Ajuste de saldo não é despesa (é correção do saldo do caixa): entrava no "lucro do mês" como gasto.
      where: { type: "saida", transferenciaId: null, AND: [{ NOT: { description: { startsWith: "Liberação de capital" } } }, { NOT: { description: { startsWith: "Ajuste de saldo" } } }], createdAt: { gte: desde } },
      select: { amount: true, createdAt: true },
    }),
    prisma.tentativaContato.findMany({ where: { resultado: "prometeu", dataPromessa: { not: null }, createdAt: { gte: desde } }, select: { contactId: true, usuario: true, createdAt: true, dataPromessa: true } }),
  ]);

  const capital = new Map(contatos.map((c) => [c.id, c.valorCapital || 0]));
  const itens = rec.itens || [];
  const doMes = (dia) => dia.slice(0, 7) === mesAtual;

  // Quando cada cliente com promessa pagou (para ver se cumpriu).
  const ids = [...new Set(tentativas.map((t) => t.contactId))];
  const pagamentos = new Map();
  if (ids.length) {
    const ls = await emLotes(ids, (lote) => prisma.lancamento.findMany({ where: { type: "entrada", contactId: { in: lote }, createdAt: { gte: desde } }, select: { contactId: true, createdAt: true } }));
    for (const l of ls) { if (!pagamentos.has(l.contactId)) pagamentos.set(l.contactId, []); pagamentos.get(l.contactId).push(l.createdAt); }
  }

  return NextResponse.json({
    hoje, meses, semanas,
    carteira: carteiraPorMes({ meses, hoje, logs, capital, parcelas }), // 5
    recuperacao: recuperacaoPorSemana({ semanas, itens }), // 6
    calor: calorDiaHora(entradas), // 8
    rankingCobradores: ranking(itens.filter((i) => doMes(i.dia)), (i) => i.baixadoPor, (i) => i.valor).slice(0, 10), // 9
    rankingVendedores: ranking(liberacoes.filter((l) => l.createdAt >= inicioDoMes(mesAtual)), (l) => l.contact?.responsavel, (l) => l.amount).slice(0, 10), // 10
    // Só quem pegou empréstimo: os ~2.000 leads sem capital entravam como "ciclo 1" e derrubavam a % de renovação.
    ciclos: distribuicaoCiclos(contatos.filter((c) => (Number(c.valorCapital) || 0) > 0).map((c) => c.cicloAtual)), // 13
    ticket: ticketPorMes({ meses, liberacoes }), // 14
    atraso: prazoAtrasoPorMes({ meses, pagas: parcelas.filter((p) => p.paid && p.paidAt) }), // 15
    perdas: perdasPorMes({ meses, capital, logsCravo: logs.filter((l) => l.paraEtapa === "Cravo") }), // 17
    promessas: promessasPorUsuario({ tentativas, entradas: pagamentos, hoje }), // 18
    resultado: resultadoMensal({ meses, entradas, despesas, honorariosPct: cfg?.honorariosPct ?? 30 }), // 20
  });
}
