import { prisma } from "@/lib/prisma";
import { whereRecebidoEntre, valorRecebidoDe } from "@/lib/finance";
import { inicioDaSemanaTrabalho } from "@/lib/comissao";

// Comissão percentual sobre o recebimento da OPERAÇÃO INTEIRA (não filtra por
// quem deu baixa) — mesmo escopo de lib/pagamentoCobrador.js, só que baseada
// em % em vez de fixo+bônus por meta.
//
// Split capital/juros usa exatamente a mesma regra já usada no placar de
// comissão por meta (lib/comissao.js, itensJuros): juros = só a parte que
// passou do valor normal (`amount`) da parcela — é a multa por atraso.
const diaLocal = (d) => new Date(d).toLocaleDateString("en-CA");

function diasDaSemanaTrabalho(hoje = new Date()) {
  const ini = inicioDaSemanaTrabalho(hoje);
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(ini);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

export async function calcularComissaoPercentualSemana(userId, hoje = new Date()) {
  const cfg = await prisma.comissaoPercentualConfig.findUnique({
    where: { userId },
    include: { user: { select: { id: true, name: true } } },
  });
  if (!cfg || !cfg.ativo) return null;

  const dias = diasDaSemanaTrabalho(hoje);
  const de = new Date(dias[0] + "T00:00:00.000Z");
  de.setUTCDate(de.getUTCDate() - 1); // folga: filtro exato é por data local abaixo
  const ate = new Date(dias[5] + "T00:00:00.000Z");
  ate.setUTCDate(ate.getUTCDate() + 2);

  const parcelas = await prisma.parcela.findMany({
    where: whereRecebidoEntre(de, ate),
    select: { amount: true, amountPago: true, paid: true, valorPago: true, valorPagoEm: true, paidAt: true },
  });

  const permitidos = new Set(dias);
  let valorCapital = 0;
  let valorJuros = 0;
  for (const p of parcelas) {
    const data = p.paid ? p.paidAt : p.valorPagoEm;
    if (!data || !permitidos.has(diaLocal(data))) continue;
    const recebido = valorRecebidoDe(p);
    const juros = Math.max(0, recebido - p.amount);
    valorJuros += juros;
    valorCapital += recebido - juros;
  }

  const comissaoCapital = Math.round(valorCapital * (cfg.pctCapital / 100) * 100) / 100;
  const comissaoJuros = Math.round(valorJuros * (cfg.pctJuros / 100) * 100) / 100;

  return {
    userId: cfg.userId,
    nome: cfg.user.name,
    inicio: dias[0],
    fim: dias[5],
    pctCapital: cfg.pctCapital,
    pctJuros: cfg.pctJuros,
    valorCapital: Math.round(valorCapital * 100) / 100,
    valorJuros: Math.round(valorJuros * 100) / 100,
    comissaoCapital,
    comissaoJuros,
    total: Math.round((comissaoCapital + comissaoJuros) * 100) / 100,
  };
}

export function textoRelatorioComissaoPercentual(r) {
  const brl = (n) => "R$ " + Number(n || 0).toFixed(2).replace(".", ",");
  const dia = (d) => d.slice(8, 10) + "/" + d.slice(5, 7);
  return [
    `💰 Comissão da semana — ${r.nome}`,
    `Período: ${dia(r.inicio)} a ${dia(r.fim)}`,
    "",
    `Recebido sem multa: ${brl(r.valorCapital)} × ${r.pctCapital}% = ${brl(r.comissaoCapital)}`,
    `Recebido de multa por atraso: ${brl(r.valorJuros)} × ${r.pctJuros}% = ${brl(r.comissaoJuros)}`,
    "",
    `TOTAL A PAGAR: ${brl(r.total)}`,
  ].join("\n");
}
