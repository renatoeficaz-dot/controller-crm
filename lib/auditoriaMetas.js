import { prisma } from "@/lib/prisma";
import { primeiraVez, enviar } from "@/lib/alertas";
import { registrarAuditoria } from "@/lib/auditoria";
import { resultadoDoDia, serieDeDias, hojeStr, somarDias } from "@/lib/metas";
import { resumoMetas } from "@/lib/metasResumo";

// Conferência automática das metas, de hora em hora. As telas (cartão do dia, calendário, lista de baixas, placar, lista de liberações,
// comissão) saem todas de uma mesma fonte; se alguma voltar a divergir — ou se entrar de novo um lançamento de caixa em dobro — o dono é
// avisado na hora, em vez de alguém descobrir pelo número errado dias depois. Cada problema avisa uma única vez (chave no banco).
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const soma = (lista, campo) => (lista || []).reduce((t, x) => t + (Number(x[campo]) || 0), 0);

export async function checarConsistenciaMetas() {
  const hoje = hojeStr();
  const problemas = [];

  for (const dia of [hoje, somarDias(hoje, -1)]) {
    const [real, serie, res] = await Promise.all([resultadoDoDia(dia), serieDeDias(dia, dia), resumoMetas(dia)]);
    const s = serie[0] || {};
    const comparacoes = [
      ["recebido: cartão × calendário", real.recebimentos, s.recebimentos],
      ["recebido: cartão × lista de baixas", real.recebimentos, soma(res.baixasDetalhe, "valor")],
      ["recebido: cartão × placar por pessoa", real.recebimentos, soma(res.placar, "valorRecebido")],
      ["liberado: cartão × calendário", real.liberado, s.liberado],
      ["liberado: cartão × lista de liberações", real.liberado, soma(res.liberacoesDetalhe, "valorCapital")],
      ["liberado: cartão × placar por pessoa", real.liberado, soma(res.placar, "valorVendido")],
      ["liberado: venda nova + renovação × total", real.liberado, (res.liberadoNovo || 0) + (res.liberadoRenovacao || 0)],
    ];
    for (const [nome, a, b] of comparacoes) {
      if (Math.abs(r2(a) - r2(b)) > 0.011) problemas.push({ chave: `metas-diverge:${dia}:${nome}`, texto: `${dia.split("-").reverse().join("/")} — ${nome}: ${r2(a)} ≠ ${r2(b)}` });
    }
  }

  // Lançamento de caixa em dobro: parcela com mais dinheiro lançado do que ela pagou (só o que entrou nas últimas 3 h — o que já existia
  // foi avisado/tratado à parte).
  const desde = new Date(Date.now() - 3 * 3600e3);
  const recentes = await prisma.lancamento.findMany({ where: { type: "entrada", parcelaId: { not: null }, createdAt: { gte: desde } }, select: { parcelaId: true } });
  const ids = [...new Set(recentes.map((l) => l.parcelaId))];
  if (ids.length) {
    const [parcelas, entradas] = await Promise.all([
      prisma.parcela.findMany({ where: { id: { in: ids } }, select: { id: true, number: true, paid: true, amountPago: true, valorPago: true, contact: { select: { name: true } } } }),
      prisma.lancamento.findMany({ where: { type: "entrada", parcelaId: { in: ids } }, select: { parcelaId: true, amount: true } }),
    ]);
    const totalPor = new Map();
    for (const l of entradas) totalPor.set(l.parcelaId, (totalPor.get(l.parcelaId) || 0) + (l.amount || 0));
    for (const p of parcelas) {
      const teto = p.paid ? (p.amountPago != null ? p.amountPago : Infinity) : p.valorPago || 0;
      const excesso = r2((totalPor.get(p.id) || 0) - teto);
      if (excesso > 0.02) problemas.push({ chave: `caixa-dobro:${p.id}:${excesso}`, texto: `Caixa em dobro: ${p.contact?.name || "cliente"}, parcela ${p.number}ª — lançado R$ ${excesso} a mais do que a parcela pagou` });
    }
  }

  // Mudança de etapa sem registro: a base da meta de recebimento lê o HISTÓRICO de etapas (EtapaLog) pra saber quem estava em Recebimento em
  // cada dia. Se alguma tela/rotina nova mudar a etapa sem gravar o log, a base erra em silêncio — aqui isso vira aviso na hora. Só olha as
  // etapas do ciclo de cobrança (um lead que nasce no funil não tem log de entrada).
  const ETAPAS_COBRANCA = ["Liberação pagamento", "Recebimento", "Renovação", "Pago", "Cravo", "Venda perdida"];
  const moveram = await prisma.contact.findMany({
    where: { excluidoEm: null, entrouEtapaEm: { gte: desde }, stage: { name: { in: ETAPAS_COBRANCA } } },
    select: { id: true, name: true, stage: { select: { name: true } } },
  });
  if (moveram.length) {
    const logs = await prisma.etapaLog.findMany({ where: { contactId: { in: moveram.map((c) => c.id) }, createdAt: { gte: new Date(desde.getTime() - 60e3) } }, select: { contactId: true, paraEtapa: true } });
    const registrados = new Set(logs.map((l) => l.contactId + "|" + l.paraEtapa));
    for (const c of moveram) {
      if (!registrados.has(c.id + "|" + c.stage?.name)) problemas.push({ chave: `etapa-sem-log:${c.id}:${c.stage?.name}`, texto: `Etapa sem registro: ${c.name} foi para "${c.stage?.name}" e a mudança não foi gravada no histórico` });
    }
  }

  const novos = [];
  for (const p of problemas) if (await primeiraVez(p.chave)) novos.push(p.texto);
  if (!novos.length) return 0;

  // Esse registro é o aviso DENTRO do sistema (faixa no rodapé dos admins, ver divergenciasRecentes): vale mesmo sem número de WhatsApp.
  // Com await, para a faixa já poder ler a linha no próximo ciclo e o teste não depender de corrida.
  await registrarAuditoria({ usuario: null, acao: "inconsistencia_metas", entidade: "Metas", detalhe: novos.join(" | ").slice(0, 1500) });
  const cfg = await prisma.config.findUnique({ where: { id: "singleton" } });
  if (cfg?.alertaCriticos && cfg.alertaWhatsapp) {
    await enviar(`⚠️ *Conferência das metas*\n\nOs números divergiram:\n${novos.map((t) => `• ${t}`).join("\n")}\n\nO sistema registrou o aviso; confira a tela de Metas.`, cfg.alertaWhatsapp);
  }
  return novos.length;
}

// Avisos de divergência das últimas `horas` (mais novo primeiro), para a faixa vermelha no rodapé dos admins. Existe porque o WhatsApp só
// sai com o número de alertas preenchido em Configurações; sem ele o aviso ficava gravado e ninguém via. Cada linha é uma rodada da
// conferência (itens separados por " | " no detalhe).
export async function divergenciasRecentes(horas = 24) {
  const linhas = await prisma.auditLog.findMany({
    where: { acao: "inconsistencia_metas", createdAt: { gte: new Date(Date.now() - horas * 3600e3) } },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, createdAt: true, detalhe: true },
  });
  return linhas.map((l) => ({ id: l.id, quando: l.createdAt, itens: String(l.detalhe || "").split(" | ").map((t) => t.trim()).filter(Boolean) }));
}
