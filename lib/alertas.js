import { prisma } from "@/lib/prisma";
import { hojeStr, parcelaAtrasada } from "@/lib/finance";

const money = (n) =>
  "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Estado em memória pra não repetir aviso. O job roda a cada 5 min: sem isso,
// o resumo diário sairia 12 vezes por hora e cada calote seria avisado sem parar.
const enviado = { resumoDoDia: null, criticos: new Set() };

// Manda pelo número marcado como padrão — é o que está conectado e conhecido.
async function enviar(texto, destino) {
  if (!destino) return { ok: false, error: "sem destino" };
  const numero = await prisma.whatsappNumber.findFirst({ where: { padrao: true } });
  if (!numero) return { ok: false, error: "nenhum número marcado como padrão" };
  const { sendWhatsappText } = await import("@/lib/evolution");
  return sendWhatsappText(destino, texto, numero.instance);
}

export async function montarResumoDiario() {
  const hoje = hojeStr();
  const inicio = new Date(hoje + "T00:00:00.000Z");
  const fim = new Date(inicio);
  fim.setUTCDate(fim.getUTCDate() + 1);

  const cfg = await prisma.config.findUnique({ where: { id: "singleton" } });
  const recebimento = await prisma.stage.findFirst({ where: { name: "Recebimento" } });

  const [vendas, pagantes, valor, emRecebimento] = await Promise.all([
    prisma.contact.count({ where: { entrouRecebimentoEm: { gte: inicio, lt: fim } } }),
    prisma.parcela.findMany({
      where: { paid: true, paidAt: { gte: inicio, lt: fim } },
      select: { contactId: true },
      distinct: ["contactId"],
    }),
    prisma.parcela.aggregate({
      where: { paid: true, paidAt: { gte: inicio, lt: fim } },
      _sum: { amountPago: true },
    }),
    recebimento ? prisma.contact.count({ where: { stageId: recebimento.id } }) : 0,
  ]);

  // Quanto ainda está vencido e em aberto agora.
  const contatos = await prisma.contact.findMany({
    where: { parcelas: { some: { paid: false } } },
    select: { parcelas: { select: { paid: true, dueDate: true, amount: true } } },
  });
  let emAtraso = 0;
  let clientesAtrasados = 0;
  for (const c of contatos) {
    const atrasadas = c.parcelas.filter((p) => parcelaAtrasada(p, hoje));
    if (!atrasadas.length) continue;
    clientesAtrasados++;
    emAtraso += atrasadas.reduce((acc, p) => acc + p.amount, 0);
  }

  const metaVendas = cfg?.metaVendasDia ?? 0;
  const metaReceb = Math.ceil((emRecebimento * (cfg?.metaPctRecebimento ?? 0)) / 100);

  return [
    `📊 *Resumo do dia — ${new Date().toLocaleDateString("pt-BR")}*`,
    ``,
    `💰 Recebido: ${money(valor._sum.amountPago || 0)}`,
    `✅ Clientes que pagaram: ${pagantes.length}${metaReceb ? ` de ${metaReceb} (meta)` : ""}`,
    `🤝 Vendas: ${vendas}${metaVendas ? ` de ${metaVendas} (meta)` : ""}`,
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
  if (enviado.resumoDoDia === hoje) return;

  const [h, m] = cfg.alertaHora.split(":").map(Number);
  const agora = new Date();
  const diff = Math.abs(agora.getHours() * 60 + agora.getMinutes() - (h * 60 + (m || 0)));
  if (diff > 5) return;

  enviado.resumoDoDia = hoje; // marca antes de enviar pra não duplicar se demorar
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
      if (enviado.criticos.has(chave)) continue;
      enviado.criticos.add(chave);
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
      if (enviado.criticos.has(chave)) continue;
      enviado.criticos.add(chave);
      await enviar(`🚨 *Calote acima do limite*\n\n${c.name} entrou em Cravo com ${money(c.valorCapital)} de capital.`, cfg.alertaWhatsapp);
    }
  }
}

// Usado pelo botão "Enviar teste agora" da tela de configuração.
export async function enviarTeste() {
  const cfg = await prisma.config.findUnique({ where: { id: "singleton" } });
  if (!cfg?.alertaWhatsapp) return { ok: false, error: "Informe o número que vai receber os alertas." };
  const texto = await montarResumoDiario();
  return enviar(`🧪 _Teste de alerta_\n\n${texto}`, cfg.alertaWhatsapp);
}
