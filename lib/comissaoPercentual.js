import { prisma } from "@/lib/prisma";
import { inicioDaSemanaTrabalho, diaComissao } from "@/lib/comissao";
import { recebidosNoPeriodo, somarDias } from "@/lib/metas";

// Comissão percentual sobre o recebimento da OPERAÇÃO INTEIRA (não filtra por
// quem deu baixa) — mesmo escopo de lib/pagamentoCobrador.js, só que baseada
// em % em vez de fixo+bônus por meta.
//
// O recebido vem do CAIXA, pela mesma função da tela de Metas (recebidosNoPeriodo), e cada valor cai na semana pelo mesmo corte da
// comissão (diaComissao: sábado a partir das 17h já é da semana seguinte). Antes olhava a parcela (não o caixa) e o dia do calendário:
// o dinheiro de sábado depois do fechamento não entrava em semana nenhuma — nem nesta (o relatório saiu às 17h) nem na seguinte.
//
// Split capital/juros: juros = só a parte que passou do valor normal (`amount`) da parcela — é a multa por atraso.
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
  const permitidos = new Set(dias);
  // Folga de 3 dias antes: sábado depois do corte da semana anterior cai na segunda desta (diaComissao desloca +2 dias).
  const { itens } = await recebidosNoPeriodo(somarDias(dias[0], -3), somarDias(dias[5], 1));
  // Juros por PARCELA (a multa é o que a parcela recebeu além do valor dela, somando as entradas da semana).
  const porParcela = new Map();
  for (const it of itens) {
    if (!permitidos.has(diaComissao(it.hora))) continue;
    const x = porParcela.get(it.id) || { total: 0, amount: it.amount };
    x.total += it.valor;
    porParcela.set(it.id, x);
  }
  let valorCapital = 0;
  let valorJuros = 0;
  for (const { total, amount } of porParcela.values()) {
    const juros = Math.max(0, total - amount);
    valorJuros += juros;
    valorCapital += total - juros;
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
    // Sem comissão sobre multa (0%), a linha só confunde: não mostra o cálculo.
    ...(Number(r.comissaoJuros) > 0 ? [`Recebido de multa por atraso: ${brl(r.valorJuros)} × ${r.pctJuros}% = ${brl(r.comissaoJuros)}`] : []),
    "",
    `TOTAL A PAGAR: ${brl(r.total)}`,
  ].join("\n");
}
