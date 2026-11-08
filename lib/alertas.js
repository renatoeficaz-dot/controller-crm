import { prisma } from "@/lib/prisma";
import { hojeStr, parcelaAtrasada, valorEmAberto } from "@/lib/finance";

const money = (n) =>
  "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Trava de "já avisei isso" no BANCO, não em memória. O job roda a cada 5 min,
// então sem trava o resumo sairia 12x por hora; e com a trava só em memória,
// todo deploy/restart zerava e remandava tudo que já tinha sido avisado.
// Devolve true na primeira vez, false nas seguintes.
export async function primeiraVez(chave) {
  try {
    await prisma.alertaEnviado.create({ data: { chave } });
    return true;
  } catch {
    return false; // violação da unique = já foi avisado antes
  }
}

// Manda pelo número marcado como padrão — é o que está conectado e conhecido.
export async function enviar(texto, destino) {
  if (!destino) return { ok: false, error: "sem destino" };
  const numero = await prisma.whatsappNumber.findFirst({ where: { padrao: true } });
  if (!numero) return { ok: false, error: "nenhum número marcado como padrão" };
  const { sendWhatsappText } = await import("@/lib/evolution");
  return sendWhatsappText(destino, texto, numero.instance);
}

// Resumo do dia pro WhatsApp do dono. Lê dos MESMOS cálculos da tela de Metas (resultadoDoDia + metasDoDia), então os números e as
// metas nunca divergem do que o time vê. Antes: a janela do dia começava à meia-noite UTC (21h de ontem no Brasil), o "recebido" vinha das
// parcelas (não do caixa) e as metas eram as antigas, em contagem de clientes/vendas — "pagaram 31 de 40" sem relação com a meta em R$.
const NOME_NIVEL = { meta: "meta cheia batida 🏆", media: "bateu a média", minima: "bateu a mínima", abaixo: "abaixo da mínima" };
function nivelDe(atual, minima, media, meta) {
  if (!meta) return null;
  if (atual >= meta) return "meta";
  if (atual >= media) return "media";
  if (atual >= minima) return "minima";
  return "abaixo";
}

export async function montarResumoDiario() {
  const hoje = hojeStr();
  const { resultadoDoDia, metasDoDia } = await import("@/lib/metas");
  const recebimento = await prisma.stage.findFirst({ where: { name: "Recebimento" } });
  const [real, metas, emRecebimento] = await Promise.all([
    resultadoDoDia(hoje),
    metasDoDia(hoje),
    recebimento ? prisma.contact.count({ where: { stageId: recebimento.id, excluidoEm: null } }) : 0,
  ]);

  // Quanto ainda está vencido e em aberto agora.
  const contatos = await prisma.contact.findMany({
    where: { parcelas: { some: { paid: false, renegociada: false } } },
    select: { parcelas: { select: { paid: true, dueDate: true, amount: true, valorPago: true } } },
  });
  let emAtraso = 0;
  let clientesAtrasados = 0;
  for (const c of contatos) {
    const atrasadas = c.parcelas.filter((p) => parcelaAtrasada(p, hoje));
    if (!atrasadas.length) continue;
    clientesAtrasados++;
    emAtraso += atrasadas.reduce((acc, p) => acc + valorEmAberto(p), 0);
  }

  const nvReceb = nivelDe(real.recebimentos, metas.metaRecebimentosMinima, metas.metaRecebimentosMedia, metas.metaRecebimentosDia);
  const nvLib = nivelDe(real.liberado, metas.metaLiberacaoMinima, metas.metaLiberacaoMedia, metas.metaLiberacaoDia);
  const pct = (a, b) => (b > 0 ? ` (${Math.round((a / b) * 100)}%)` : "");

  return [
    `📊 *Resumo do dia — ${new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}*`,
    ``,
    `💰 Recebido: ${money(real.recebimentos)}${metas.metaRecebimentosDia ? ` de ${money(metas.metaRecebimentosDia)} (meta)${pct(real.recebimentos, metas.metaRecebimentosDia)} — ${NOME_NIVEL[nvReceb]}` : ""}`,
    `🏦 Liberado: ${money(real.liberado)}${metas.metaLiberacaoDia ? ` de ${money(metas.metaLiberacaoDia)} (meta)${pct(real.liberado, metas.metaLiberacaoDia)} — ${NOME_NIVEL[nvLib]}` : ""}`,
    `✅ Clientes que pagaram: ${real.clientesRecebimento}`,
    `🤝 Vendas novas: ${real.vendas}`,
    ``,
    `⚠️ Em atraso: ${money(emAtraso)} (${clientesAtrasados} cliente${clientesAtrasados === 1 ? "" : "s"})`,
    `📁 Em Recebimento: ${emRecebimento}`,
  ].join("\n");
}

// Resumo diário no horário configurado, com tolerância de 5 min (mesma lógica
// do lembrete de cobrança, já que o job roda em intervalo).
export async function checarResumoDiario() {
  const cfg = await prisma.config.findUnique({ where: { id: "singleton" } });
  if (!cfg?.alertaResumoDiario || !cfg.alertaWhatsapp || !cfg.alertaHora) return;

  const hoje = hojeStr();

  const [h, m] = cfg.alertaHora.split(":").map(Number);
  const agora = new Date();
  const diff = Math.abs(agora.getHours() * 60 + agora.getMinutes() - (h * 60 + (m || 0)));
  if (diff > 5) return;

  // Marca antes de enviar pra não duplicar se o envio demorar.
  if (!(await primeiraVez(`resumo:${hoje}`))) return;
  const texto = await montarResumoDiario();
  await enviar(texto, cfg.alertaWhatsapp);
}

// Avisos na hora: número de WhatsApp desconectado e lead com capital alto
// caindo em Cravo. Cada evento é avisado uma única vez.
export async function checarAlertasCriticos() {
  const cfg = await prisma.config.findUnique({ where: { id: "singleton" } });
  if (!cfg?.alertaCriticos || !cfg.alertaWhatsapp) return;

  const numeros = await prisma.whatsappNumber.findMany();
  for (const n of numeros) {
    if (n.ultimoEstado && n.ultimoEstado !== "open") {
      const chave = `numero:${n.id}:${n.desconectadoEm || ""}`;
      if (!(await primeiraVez(chave))) continue;
      await enviar(`🔴 *Número desconectado*\n\n${n.label} (${n.number}) caiu. Reconecte pelo QR em Configurações.`, cfg.alertaWhatsapp);
    }
  }

  const cravo = await prisma.stage.findFirst({ where: { name: "Cravo" } });
  if (cravo) {
    const grandes = await prisma.contact.findMany({
      where: { stageId: cravo.id, valorCapital: { gte: cfg.alertaCapitalMin ?? 500 } },
      select: { id: true, name: true, valorCapital: true },
    });
    for (const c of grandes) {
      const chave = `cravo:${c.id}`;
      if (!(await primeiraVez(chave))) continue;
      await enviar(`🚨 *Calote acima do limite*\n\n${c.name} entrou em Cravo com ${money(c.valorCapital)} de capital.`, cfg.alertaWhatsapp);
    }
  }
}

// A régua automática de cobrança não manda mensagem pra quem já virou Cravo
// (lib/lembreteCobranca.js só cobre "Recebimento") — de propósito, pra não
// ficar mandando mensagem de bot pra quem já foi considerado calote. Só que
// isso também significa que, sem um cobrador acompanhar manualmente, o lead
// fica parado sem NINGUÉM saber. Este alerta avisa o gestor (1x por semana
// por lead) quando um Cravo passa 7 dias sem nenhuma tentativa de contato
// registrada — não manda nada pro cliente, só evita que fique esquecido.
export async function checarCravoParado() {
  const cfg = await prisma.config.findUnique({ where: { id: "singleton" } });
  if (!cfg?.alertaCriticos || !cfg.alertaWhatsapp) return;

  const cravo = await prisma.stage.findFirst({ where: { name: "Cravo" } });
  if (!cravo) return;

  const contatos = await prisma.contact.findMany({
    where: { stageId: cravo.id, excluidoEm: null },
    include: { tentativas: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  const seteDiasAtras = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const semana = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000)); // muda a chave a cada 7 dias

  for (const c of contatos) {
    const ultima = c.tentativas[0]?.createdAt;
    if (ultima && new Date(ultima).getTime() > seteDiasAtras) continue;

    const chave = `cravo-parado:${c.id}:${semana}`;
    if (!(await primeiraVez(chave))) continue;
    const desde = ultima ? "última tentativa há mais de 7 dias" : "nenhuma tentativa de contato registrada";
    await enviar(
      `📭 *Cravo parado*\n\n${c.name} está em Cravo e ${desde}. Ninguém está acompanhando esse caso.`,
      cfg.alertaWhatsapp
    );
  }
}

// Capital ocioso: dinheiro parado em caixa há X dias sem nenhuma liberação de
// capital é lucro que não aconteceu — o giro é o que faz a operação render.
// Roda 1x/dia (a trava de "já avisei hoje" fica no instrumentation).
export async function checarCapitalOcioso() {
  const cfg = await prisma.config.findUnique({ where: { id: "singleton" } });
  if (!cfg?.alertaCriticos || !cfg.alertaWhatsapp) return false;
  const dias = cfg.capitalOciosoDias ?? 3;
  if (dias < 1) return false;

  const ultimaLiberacao = await prisma.lancamento.findFirst({
    where: { type: "saida", description: { startsWith: "Liberação de capital" } },
    orderBy: { date: "desc" },
    select: { date: true },
  });

  const [entradas, saidas] = await Promise.all([
    prisma.lancamento.aggregate({ where: { type: "entrada" }, _sum: { amount: true } }),
    prisma.lancamento.aggregate({ where: { type: "saida" }, _sum: { amount: true } }),
  ]);
  const saldo = (entradas._sum.amount || 0) - (saidas._sum.amount || 0);
  if (saldo <= 0) return false;

  const base = ultimaLiberacao?.date ? new Date(ultimaLiberacao.date) : null;
  const diasParado = base
    ? Math.floor((Date.now() - base.getTime()) / 86400000)
    : dias; // nunca liberou nada: trata como no limite pra avisar
  if (diasParado < dias) return false;

  // Uma vez por dia, mesmo que o container reinicie no meio do dia.
  if (!(await primeiraVez(`ocioso:${hojeStr()}`))) return false;

  await enviar(
    `💤 *Capital ocioso*

${money(saldo)} em caixa e ${diasParado} dia(s) sem liberar capital. Dinheiro parado não gira.`,
    cfg.alertaWhatsapp
  );
  return true;
}

// Usado pelo botão "Enviar teste agora" da tela de configuração.
export async function enviarTeste() {
  const cfg = await prisma.config.findUnique({ where: { id: "singleton" } });
  if (!cfg?.alertaWhatsapp) return { ok: false, error: "Informe o número que vai receber os alertas." };
  const texto = await montarResumoDiario();
  return enviar(`🧪 _Teste de alerta_\n\n${texto}`, cfg.alertaWhatsapp);
}
