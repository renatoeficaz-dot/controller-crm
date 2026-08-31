import { prisma } from "@/lib/prisma";
import { chaveDia, somarDias, foiRecuperacao } from "@/lib/metas";
import { whereRecebidoEntre, valorRecebidoDe } from "@/lib/finance";

// Ranking da equipe num período (não só "hoje" — item 41: histórico de verdade,
// sempre recalculado do dado bruto, então funciona pra qualquer intervalo).
export async function rankingPeriodo(diaInicio, diaFim) {
  const de = chaveDia(diaInicio);
  const ate = chaveDia(somarDias(diaFim, 1));

  const [vendas, parcelas, users] = await Promise.all([
    prisma.contact.findMany({
      where: { entrouRecebimentoEm: { gte: de, lt: ate }, excluidoEm: null },
      select: { responsavel: true, valorCapital: true },
    }),
    prisma.parcela.findMany({
      where: whereRecebidoEntre(de, ate),
      select: { baixadoPor: true, contactId: true, amount: true, amountPago: true, paid: true, valorPago: true, valorPagoEm: true, paidAt: true, dueDate: true },
    }),
    prisma.user.findMany({ select: { name: true } }),
  ]);

  const mapa = new Map();
  const garante = (nome) => {
    const chave = nome || "— sem responsável —";
    if (!mapa.has(chave)) {
      mapa.set(chave, { nome: chave, vendas: 0, valorVendido: 0, baixas: 0, valorRecebido: 0, valorRecuperado: 0, _clientes: new Set() });
    }
    return mapa.get(chave);
  };

  for (const u of users) garante(u.name);
  for (const v of vendas) {
    const r = garante(v.responsavel);
    r.vendas += 1;
    r.valorVendido += v.valorCapital || 0;
  }
  for (const p of parcelas) {
    const r = garante(p.baixadoPor);
    r.baixas += 1;
    const val = valorRecebidoDe(p);
    r.valorRecebido += val;
    if (foiRecuperacao(p)) r.valorRecuperado += val;
    r._clientes.add(p.contactId);
  }

  const r2 = (n) => Math.round((n || 0) * 100) / 100;
  return [...mapa.values()]
    // Ranking também conta parcela baixada, não cliente distinto.
    .map(({ _clientes, ...r }) => ({ ...r, valorVendido: r2(r.valorVendido), valorRecebido: r2(r.valorRecebido), valorRecuperado: r2(r.valorRecuperado), recebimentos: r.baixas }))
    .filter((r) => r.vendas || r.baixas)
    .sort((a, b) => b.valorRecebido - a.valorRecebido || b.vendas - a.vendas);
}
