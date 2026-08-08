import { prisma } from "@/lib/prisma";
import { ondePodeReceberAutomatico } from "@/lib/envioAutomatico";
import { ufFromPhone } from "@/lib/ddd";
import { interpolarVariaveis } from "@/lib/variaveis";
import { dueStr } from "@/lib/finance";
import { atingiuLimite, atingiuLimiteHora } from "@/lib/aquecimento";

function hojeUTC() {
  const hoje = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD local
  return new Date(hoje + "T00:00:00.000Z");
}

// Subtrai 1h30 de "HH:MM" (horário limite de pagamento) pra achar o horário alvo do lembrete.
function horaAlvo(pagamentoHoraLimite) {
  const [h, m] = (pagamentoHoraLimite || "10:00").split(":").map(Number);
  let total = h * 60 + (m || 0) - 90;
  if (total < 0) total += 24 * 60;
  return { h: Math.floor(total / 60), m: total % 60 };
}

// Dias de atraso do contato = diferença entre hoje e o vencimento da parcela
// não paga MAIS ANTIGA. Negativo significa que ainda vai vencer (véspera).
function diasAtrasoDe(contact, hoje) {
  const abertas = (contact.parcelas || []).filter((p) => !p.paid && !p.renegociada);
  if (!abertas.length) return null;
  const maisAntiga = abertas.slice().sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0];
  // dueStr (lib/finance.js) em vez de String(date).slice: no servidor o
  // dueDate vem do Prisma como Date, e String(Date) devolve "Thu Jul 09
  // 2026 ...". O slice pegava "Thu Jul 09", que vira Invalid Date e fazia
  // este cálculo dar NaN — nenhuma faixa da régua casa com NaN, então
  // NENHUMA cobrança automática por faixa de atraso era enviada.
  return Math.round((hoje - new Date(dueStr(maisAntiga) + "T00:00:00.000Z")) / 86400000);
}

// Faixa da régua que cobre esse atraso. Havendo mais de uma, vence a de menor
// `ordem` (a lista já vem ordenada por isso).
function regraPara(regras, dias) {
  if (dias == null) return null;
  return regras.find((r) => dias >= r.diasMin && (r.diasMax == null || dias <= r.diasMax)) || null;
}

// Quantas parcelas vencidas (não pagas, não renegociadas) o contato acumula.
function parcelasAtrasadasCount(contact, hoje) {
  return (contact.parcelas || []).filter(
    (p) => !p.paid && !p.renegociada && new Date(dueStr(p) + "T00:00:00.000Z") < hoje
  ).length;
}

// Roda a cada poucos minutos (ver instrumentation.js). Só envia lembrete quando
// o horário atual bate com "1h30 antes do horário limite de pagamento" — usa
// uma janela de tolerância pra não perder o disparo entre execuções do intervalo.
export async function checarLembretesCobranca() {
  const cfg = await prisma.config.findUnique({ where: { id: "singleton" } });
  const alvo = horaAlvo(cfg?.pagamentoHoraLimite);
  const agora = new Date();
  const horaAtualMin = agora.getHours() * 60 + agora.getMinutes();
  const alvoMin = alvo.h * 60 + alvo.m;
  if (Math.abs(horaAtualMin - alvoMin) > 5) return;

  const recebimento = await prisma.stage.findFirst({ where: { name: "Recebimento" } });
  if (!recebimento) return;

  const regras = await prisma.regraCobranca.findMany({
    where: { ativa: true },
    orderBy: [{ ordem: "asc" }, { diasMin: "asc" }],
  });

  const hoje = hojeUTC();
  // Amanhã entra na busca porque a régua pode ter uma faixa de véspera (-1);
  // sem isso, quem ainda não venceu nunca seria selecionado.
  const amanha = new Date(hoje);
  amanha.setUTCDate(amanha.getUTCDate() + 1);
  const limiteBusca = regras.some((r) => r.diasMin < 0) ? amanha : hoje;

  const contatos = await prisma.contact.findMany({
    where: {
      stageId: recebimento.id,
      parcelas: { some: { paid: false, renegociada: false, dueDate: { lte: limiteBusca } } },
      // Travas comuns a todo envio automático: lead excluído não recebe
      // cobrança, e "não perturbe" (item 98) pausa só o automático —
      // atendimento manual continua normal.
      ...ondePodeReceberAutomatico(),
    },
    include: { parcelas: true },
  });
  if (!contatos.length) return;

  // Sem régua configurada, o número precisa ter a mensagem única antiga.
  const numeros = await prisma.whatsappNumber.findMany({
    where: regras.length
      ? { estadosCobranca: { not: null } }
      : { estadosCobranca: { not: null }, mensagemCobranca: { not: null } },
  });
  if (!numeros.length) return;

  const { sendWhatsappText } = await import("@/lib/evolution");
  const { pareceBloqueado } = await import("@/lib/bloqueio");

  // 1 query pra todos em vez de 1 por contato — esse job roda a cada poucos
  // minutos, então N contatos = N idas ao banco por execução, todo dia, o
  // dia inteiro. Uma consulta com "in" resolve igual e escala.
  const jaEnviados = new Set(
    (await prisma.lembreteCobrancaLog.findMany({
      where: { contactId: { in: contatos.map((c) => c.id) }, dia: hoje },
      select: { contactId: true },
    })).map((l) => l.contactId)
  );

  let enviouAlgum = false;
  const avisouLimite = new Set(); // um aviso por número, por ciclo
  for (const contact of contatos) {
    if (jaEnviados.has(contact.id)) continue;

    const uf = ufFromPhone(contact.phone);
    if (!uf) continue;
    const numero = numeros.find((n) =>
      (n.estadosCobranca || "")
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .includes(uf)
    );
    if (!numero) continue;

    // Escolhe o texto pela régua; sem régua ativa, mantém o comportamento
    // antigo de usar a mensagem única cadastrada no número.
    let texto = null;
    if (regras.length) {
      const regra = regraPara(regras, diasAtrasoDe(contact, hoje));
      if (regra) texto = regra.mensagem;
    } else {
      texto = numero.mensagemCobranca;
    }
    if (!texto) continue; // nenhuma faixa cobre esse atraso — não manda nada

    // Mais de uma parcela vencida: o cliente já parou de responder ao
    // lembrete automático diário, então continuar mandando é insistência
    // vazia (e gasta cota de aquecimento do número à toa). Daqui pra frente
    // é trabalho do cobrador, não da automação.
    if (parcelasAtrasadasCount(contact, hoje) > 1) continue;

    // Item 173: número que parece bloqueado não entra na fila — insistir só
    // desperdiça a cota de aquecimento do número que está mandando.
    if (await pareceBloqueado(contact.id)) continue;

    // Número em aquecimento tem teto diário — passar dele é o caminho mais
    // rápido pro banimento. Pula (não acumula pra depois).
    if (await atingiuLimite(numero)) {
      if (!avisouLimite.has(numero.instance)) {
        avisouLimite.add(numero.instance);
        console.warn(`[lembreteCobranca] ${numero.label}: limite de aquecimento atingido, pulando envios`);
      }
      continue;
    }
    if (await atingiuLimiteHora(numero)) {
      if (!avisouLimite.has(numero.instance + ":hora")) {
        avisouLimite.add(numero.instance + ":hora");
        console.warn(`[lembreteCobranca] ${numero.label}: teto por hora atingido, pulando envios`);
      }
      continue;
    }

    const mensagem = interpolarVariaveis(texto, contact, { descontoPct: cfg?.descontoPct });

    // Espaçamento aleatório (5-15s) entre envios — mandar tudo em sequência sem
    // pausa é a assinatura de spam que o WhatsApp detecta e usa pra banir na hora.
    if (enviouAlgum) await new Promise((r) => setTimeout(r, 5000 + Math.random() * 10000));
    enviouAlgum = true;

    const result = await sendWhatsappText(contact.phone, mensagem, numero.instance);
    await prisma.message.create({
      data: {
        contactId: contact.id,
        body: mensagem,
        kind: "text",
        fromMe: true,
        status: result.simulated ? "simulado" : result.ok ? "enviado" : "erro",
        instance: numero.instance,
      },
    });
    // Se der erro no envio real, não marca como enviado — deixa tentar de novo
    // na próxima checagem (dentro da mesma janela de tolerância).
    if (result.ok) {
      await prisma.lembreteCobrancaLog.create({ data: { contactId: contact.id, dia: hoje } }).catch(() => {});
    }
  }
}
