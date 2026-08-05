import { prisma } from "@/lib/prisma";
import { valorParcelaAtual } from "@/lib/finance";

const r2 = (n) => Math.round((n || 0) * 100) / 100;
const diaLocal = (d) => new Date(d).toLocaleDateString("en-CA");

// Item 213: melhor horário pra cobrar — em que hora do dia o cliente
// costuma RESPONDER (mensagem dele, não nossa). Cobrar quando ele
// historicamente responde é mais eficiente que cobrar num horário morto.
export async function melhorHorarioParaCobrar() {
  const mensagens = await prisma.message.findMany({
    where: { fromMe: false },
    select: { createdAt: true },
  });
  const porHora = Array.from({ length: 24 }, () => 0);
  for (const m of mensagens) porHora[new Date(m.createdAt).getHours()]++;
  const total = mensagens.length;
  const horas = porHora.map((qtd, hora) => ({ hora, qtd, pct: total ? Math.round((qtd / total) * 1000) / 10 : 0 }));
  const melhores = [...horas].sort((a, b) => b.qtd - a.qtd).slice(0, 3).filter((h) => h.qtd > 0);
  return { total, horas, melhores };
}

// Item 214: curva de recuperação por faixa de atraso — de tudo que já chegou
// a X dias de atraso em algum momento, quanto % acabou sendo pago.
const FAIXAS_ATRASO = [
  { label: "1-5 dias", min: 1, max: 5 },
  { label: "6-15 dias", min: 6, max: 15 },
  { label: "16-30 dias", min: 16, max: 30 },
  { label: "31-60 dias", min: 31, max: 60 },
  { label: "60+ dias", min: 61, max: Infinity },
];
export async function curvaRecuperacaoPorFaixa() {
  const hoje = new Date();
  const parcelas = await prisma.parcela.findMany({
    where: { renegociada: false, deAcordo: false },
    select: { dueDate: true, paid: true, paidAt: true },
  });
  const resultado = FAIXAS_ATRASO.map((f) => ({ ...f, total: 0, pagas: 0 }));
  for (const p of parcelas) {
    const referencia = p.paid ? p.paidAt : hoje;
    const diasAtraso = Math.floor((new Date(referencia) - new Date(p.dueDate)) / 86400000);
    if (diasAtraso < 1) continue; // nunca atrasou, não entra na curva
    const faixa = resultado.find((f) => diasAtraso >= f.min && diasAtraso <= f.max);
    if (!faixa) continue;
    faixa.total++;
    if (p.paid) faixa.pagas++;
  }
  return resultado.map((f) => ({
    label: f.label, total: f.total, pagas: f.pagas,
    pctRecuperado: f.total ? Math.round((f.pagas / f.total) * 1000) / 10 : null,
  }));
}

// Item 215: concentração de risco — os 10 clientes com mais dinheiro em
// aberto, e quanto % do total em aberto da carteira eles representam juntos.
export async function concentracaoDeRisco() {
  const contatos = await prisma.contact.findMany({
    where: { excluidoEm: null },
    select: {
      id: true, name: true, phone: true,
      parcelas: { where: { paid: false, renegociada: false }, select: { amount: true, dueDate: true } },
    },
  });
  const cfg = await prisma.config.findUnique({ where: { id: "singleton" } });
  const comSaldo = contatos
    .map((c) => ({
      id: c.id, nome: c.name, phone: c.phone,
      emAberto: r2(c.parcelas.reduce((s, p) => s + valorParcelaAtual(p, undefined, { multaPct: cfg?.multaPct, horaLimite: cfg?.pagamentoHoraLimite }), 0)),
      qtdParcelas: c.parcelas.length,
    }))
    .filter((c) => c.emAberto > 0)
    .sort((a, b) => b.emAberto - a.emAberto);

  const totalCarteira = r2(comSaldo.reduce((s, c) => s + c.emAberto, 0));
  const top10 = comSaldo.slice(0, 10);
  const somaTop10 = r2(top10.reduce((s, c) => s + c.emAberto, 0));
  return {
    top10,
    somaTop10,
    totalCarteira,
    pctConcentrado: totalCarteira ? Math.round((somaTop10 / totalCarteira) * 1000) / 10 : 0,
  };
}

// Item 217: dia do MÊS que mais recebe pagamento (1..31) — ajuda a saber se
// vale concentrar cobrança perto de datas de salário/benefício.
export async function diaDoMesQueMaisPaga() {
  const parcelas = await prisma.parcela.findMany({ where: { paid: true, paidAt: { not: null } }, select: { paidAt: true, amountPago: true, amount: true } });
  const porDia = Array.from({ length: 31 }, () => ({ qtd: 0, valor: 0 }));
  for (const p of parcelas) {
    const dia = new Date(p.paidAt).getDate(); // 1..31
    porDia[dia - 1].qtd++;
    porDia[dia - 1].valor += p.amountPago ?? p.amount;
  }
  return porDia.map((d, i) => ({ dia: i + 1, qtd: d.qtd, valor: r2(d.valor) }));
}

// Item 218: efeito do desconto na quitação à vista — compara o que entrou
// com desconto (Negociacao "desconto_aceito") x o que teria entrado sem
// desconto, pra ver se o desconto está valendo a pena (entra mais rápido,
// mas entra menos por real).
export async function efeitoDescontoQuitacao() {
  const negociacoes = await prisma.negociacao.findMany({
    where: { tipo: { in: ["desconto_aceito", "desconto_recusado"] } },
    select: { tipo: true, valorOriginal: true, valorNegociado: true, createdAt: true },
  });
  const aceitos = negociacoes.filter((n) => n.tipo === "desconto_aceito");
  const recusados = negociacoes.filter((n) => n.tipo === "desconto_recusado");
  const totalOriginal = r2(aceitos.reduce((s, n) => s + (n.valorOriginal || 0), 0));
  const totalNegociado = r2(aceitos.reduce((s, n) => s + (n.valorNegociado || 0), 0));
  return {
    qtdAceitos: aceitos.length,
    qtdRecusados: recusados.length,
    taxaAceite: negociacoes.length ? Math.round((aceitos.length / negociacoes.length) * 1000) / 10 : null,
    totalOriginal,
    totalNegociado,
    totalDescontado: r2(totalOriginal - totalNegociado),
    pctMedioDesconto: totalOriginal ? Math.round(((totalOriginal - totalNegociado) / totalOriginal) * 1000) / 10 : null,
  };
}

// Item 220: previsão de inadimplência por perfil — taxa histórica de atraso
// (parcela que passou de 5 dias vencida em algum momento) agrupada por
// estado (UF), gênero e tipo de cliente — os recortes que já existem no
// cadastro, sem precisar inventar "perfil de risco" do zero.
export async function inadimplenciaPorPerfil() {
  const contatos = await prisma.contact.findMany({
    where: { excluidoEm: null, valorCapital: { not: null } },
    select: {
      estado: true, genero: true, tipoCliente: true,
      parcelas: { where: { renegociada: false, deAcordo: false }, select: { paid: true, paidAt: true, dueDate: true } },
    },
  });

  function agruparPor(campo) {
    const grupos = new Map();
    for (const c of contatos) {
      const chave = c[campo] || "não informado";
      if (!grupos.has(chave)) grupos.set(chave, { chave, clientes: 0, comAtraso: 0 });
      const g = grupos.get(chave);
      g.clientes++;
      const teveAtraso = c.parcelas.some((p) => {
        const ref = p.paid ? p.paidAt : new Date();
        return ref && Math.floor((new Date(ref) - new Date(p.dueDate)) / 86400000) > 5;
      });
      if (teveAtraso) g.comAtraso++;
    }
    return [...grupos.values()]
      .map((g) => ({ ...g, taxaAtraso: g.clientes ? Math.round((g.comAtraso / g.clientes) * 1000) / 10 : 0 }))
      .sort((a, b) => b.taxaAtraso - a.taxaAtraso);
  }

  return {
    porEstado: agruparPor("estado"),
    porGenero: agruparPor("genero"),
    porTipoCliente: agruparPor("tipoCliente"),
  };
}

// Itens 287/288: mesmo TELEFONE usado em cadastros com CPFs DIFERENTES — o
// endereço não é um campo que o sistema coleta hoje, então o sinal
// disponível pra "múltiplas identidades, mesmo contato" é o telefone (quem
// fala com o cobrador é sempre a mesma pessoa, ainda que o CPF mude). É o
// mesmo padrão que aparece tanto num cadastro duplicado inocente quanto
// numa fraude com laranja — por isso fica marcado como alerta pra revisão
// humana, não como bloqueio automático.
export async function possiveisIdentidadesCompartilhadas() {
  const contatos = await prisma.contact.findMany({
    where: { excluidoEm: null, phone: { not: null }, cpf: { not: null } },
    select: { id: true, name: true, phone: true, cpf: true },
  });
  const porTelefone = new Map();
  for (const c of contatos) {
    if (!porTelefone.has(c.phone)) porTelefone.set(c.phone, []);
    porTelefone.get(c.phone).push(c);
  }
  const suspeitos = [];
  for (const [phone, lista] of porTelefone) {
    const cpfsUnicos = new Set(lista.map((c) => c.cpf));
    if (cpfsUnicos.size > 1) {
      suspeitos.push({ phone, cadastros: lista.map((c) => ({ id: c.id, nome: c.name, cpf: c.cpf })) });
    }
  }
  return suspeitos;
}

// Item 289: quem tem parcela vencendo AMANHÃ e já tem histórico de atraso —
// não é IA/previsão estatística, é o sinal mais direto e honesto que dá pra
// tirar do dado: "esse aqui costuma atrasar, e vence amanhã".
export async function provavelAtrasoAmanha() {
  const amanha = new Date(new Date().toLocaleDateString("en-CA") + "T00:00:00.000Z");
  amanha.setUTCDate(amanha.getUTCDate() + 1);
  const depois = new Date(amanha);
  depois.setUTCDate(depois.getUTCDate() + 1);

  const vencendoAmanha = await prisma.parcela.findMany({
    where: { paid: false, renegociada: false, dueDate: { gte: amanha, lt: depois } },
    select: { id: true, amount: true, contactId: true, contact: { select: { id: true, name: true, phone: true } } },
  });
  if (!vencendoAmanha.length) return [];

  const contactIds = vencendoAmanha.map((p) => p.contactId);
  const historico = await prisma.parcela.findMany({
    where: { contactId: { in: contactIds }, paid: true },
    select: { contactId: true, paidAt: true, dueDate: true },
  });
  const atrasosPorContato = new Map();
  for (const p of historico) {
    const diasAtraso = Math.floor((new Date(p.paidAt) - new Date(p.dueDate)) / 86400000);
    if (diasAtraso > 0) atrasosPorContato.set(p.contactId, (atrasosPorContato.get(p.contactId) || 0) + 1);
  }

  return vencendoAmanha
    .map((p) => ({
      contactId: p.contact.id, nome: p.contact.name, phone: p.contact.phone,
      valor: p.amount, vezesAtrasouAntes: atrasosPorContato.get(p.contactId) || 0,
    }))
    .filter((c) => c.vezesAtrasouAntes > 0)
    .sort((a, b) => b.vezesAtrasouAntes - a.vezesAtrasouAntes);
}

// Item 292: resumo semanal do que mudou na carteira (últimos 7 dias vs os
// 7 anteriores) — vendas, valor recuperado e quantos leads entraram/saíram
// de "Recebimento".
export async function resumoSemanalCarteira() {
  // Meia-noite LOCAL: a janela é comparada contra `paidAt`/`entrouRecebimentoEm`,
  // que são instantes reais. Com meia-noite UTC o corte caía às 21h e jogava as
  // vendas/baixas do fim da noite pra semana errada.
  const agora = new Date();
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const seteDiasAtras = new Date(hoje); seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);
  const catorzeDiasAtras = new Date(hoje); catorzeDiasAtras.setDate(catorzeDiasAtras.getDate() - 14);

  async function janela(de, ate) {
    const [vendas, baixas] = await Promise.all([
      prisma.contact.findMany({ where: { entrouRecebimentoEm: { gte: de, lt: ate } }, select: { valorCapital: true } }),
      prisma.parcela.findMany({ where: { paid: true, paidAt: { gte: de, lt: ate } }, select: { amountPago: true, amount: true } }),
    ]);
    return {
      vendas: vendas.length,
      valorVendido: r2(vendas.reduce((s, c) => s + (c.valorCapital || 0), 0)),
      valorRecebido: r2(baixas.reduce((s, p) => s + (p.amountPago ?? p.amount), 0)),
    };
  }

  const [atual, anterior] = await Promise.all([janela(seteDiasAtras, hoje), janela(catorzeDiasAtras, seteDiasAtras)]);
  const variacao = (a, b) => (b ? Math.round(((a - b) / b) * 1000) / 10 : null);
  return {
    atual, anterior,
    variacaoVendas: variacao(atual.vendas, anterior.vendas),
    variacaoValorRecebido: variacao(atual.valorRecebido, anterior.valorRecebido),
  };
}

// Item 297: quitados no mês — quantos ciclos/clientes terminaram de pagar
// (última parcela do plano paga) dentro do mês pedido.
export async function quitadosNoMes(anoMes) {
  const [ano, mes] = (anoMes || new Date().toISOString().slice(0, 7)).split("-").map(Number);
  const inicio = new Date(Date.UTC(ano, mes - 1, 1));
  const fim = new Date(Date.UTC(ano, mes, 1));

  const contatos = await prisma.contact.findMany({
    where: { excluidoEm: null, valorCapital: { not: null } },
    select: {
      id: true, name: true, phone: true, valorCapital: true, cicloAtual: true,
      parcelas: { select: { number: true, ciclo: true, paid: true, paidAt: true, renegociada: true } },
    },
  });

  const quitados = [];
  for (const c of contatos) {
    const ciclo = c.cicloAtual || 1;
    const doCiclo = c.parcelas.filter((p) => (p.ciclo || 1) === ciclo && !p.renegociada);
    if (!doCiclo.length || !doCiclo.every((p) => p.paid)) continue;
    const ultimoPagamento = doCiclo.reduce((max, p) => (p.paidAt && new Date(p.paidAt) > max ? new Date(p.paidAt) : max), new Date(0));
    if (ultimoPagamento >= inicio && ultimoPagamento < fim) {
      quitados.push({ id: c.id, nome: c.name, phone: c.phone, valorCapital: c.valorCapital, quitadoEm: ultimoPagamento });
    }
  }
  return quitados.sort((a, b) => new Date(b.quitadoEm) - new Date(a.quitadoEm));
}

// Item 298: cliente perto de quitar o ciclo atual (faltam <= 2 parcelas) —
// janela boa pra já sondar a renovação antes de ele sumir depois de pagar.
export async function pertoDeQuitar() {
  const contatos = await prisma.contact.findMany({
    where: { excluidoEm: null, valorCapital: { not: null } },
    select: {
      id: true, name: true, phone: true, cicloAtual: true,
      parcelas: { select: { number: true, ciclo: true, paid: true, renegociada: true, deAcordo: true } },
    },
  });
  const resultado = [];
  for (const c of contatos) {
    const ciclo = c.cicloAtual || 1;
    const doCiclo = c.parcelas.filter((p) => (p.ciclo || 1) === ciclo && !p.renegociada);
    if (!doCiclo.length) continue;
    const abertas = doCiclo.filter((p) => !p.paid);
    if (abertas.length > 0 && abertas.length <= 2) {
      resultado.push({ id: c.id, nome: c.name, phone: c.phone, faltam: abertas.length, totalParcelas: doCiclo.length });
    }
  }
  return resultado.sort((a, b) => a.faltam - b.faltam);
}

// Item 300: evolução do valor de capital emprestado a cada renovação (ciclo)
// — média do valorCapital por número de ciclo, pra ver se o valor cresce
// de forma saudável a cada renovação.
export async function evolucaoValorPorCiclo() {
  const contatos = await prisma.contact.findMany({
    where: { excluidoEm: null, valorCapital: { not: null } },
    select: { cicloAtual: true, valorCapital: true },
  });
  const porCiclo = new Map();
  for (const c of contatos) {
    const ciclo = c.cicloAtual || 1;
    if (!porCiclo.has(ciclo)) porCiclo.set(ciclo, { ciclo, qtd: 0, soma: 0 });
    const g = porCiclo.get(ciclo);
    g.qtd++;
    g.soma += c.valorCapital || 0;
  }
  return [...porCiclo.values()]
    .map((g) => ({ ciclo: g.ciclo, qtd: g.qtd, valorMedio: r2(g.soma / g.qtd) }))
    .sort((a, b) => a.ciclo - b.ciclo);
}
