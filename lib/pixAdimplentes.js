import { prisma } from "@/lib/prisma";
import { ufFromPhone } from "@/lib/ddd";
import { interpolarVariaveis } from "@/lib/variaveis";
import { atingiuLimite } from "@/lib/aquecimento";
import { gerarPixCopiaECola } from "@/lib/pix";

function hojeUTC() {
  const hoje = new Date().toLocaleDateString("en-CA");
  return new Date(hoje + "T00:00:00.000Z");
}

const MENSAGEM_PADRAO =
  "Oi {{nome}}! Sua parcela de {{valor_parcela}} vence hoje. Pra facilitar, aqui está o Pix — é só copiar e colar no seu banco:\n\n{{pix_copia_cola}}";

// Mensagem diária automática com o Pix, só pra quem está EM DIA — nenhuma
// parcela atrasada. Quem tem qualquer coisa vencida fica de fora: esse é
// trabalho do cobrador (fila de cobrança/régua), não dessa automação.
export async function enviarPixAdimplentes() {
  const cfg = await prisma.config.findUnique({ where: { id: "singleton" } });
  if (!cfg?.pixAdimplentesAtivo || !cfg?.pixChave) return;

  const [h, m] = (cfg.pixAdimplentesHora || "08:00").split(":").map(Number);
  const agora = new Date();
  const alvoMin = h * 60 + (m || 0);
  const atualMin = agora.getHours() * 60 + agora.getMinutes();
  if (Math.abs(atualMin - alvoMin) > 5) return; // fora da janela de tolerância, não roda agora

  const recebimento = await prisma.stage.findFirst({ where: { name: "Recebimento" } });
  if (!recebimento) return;

  const hoje = hojeUTC();
  const diasAntes = Math.max(0, cfg.pixAdimplentesDiasAntes ?? 0);
  const limiteFuturo = new Date(hoje);
  limiteFuturo.setUTCDate(limiteFuturo.getUTCDate() + diasAntes + 1); // exclusivo

  const contatos = await prisma.contact.findMany({
    where: {
      stageId: recebimento.id,
      excluidoEm: null,
      // Tem parcela vencendo dentro da janela (hoje, ou hoje+diasAntes)...
      parcelas: { some: { paid: false, renegociada: false, dueDate: { gte: hoje, lt: limiteFuturo } } },
      // ...e NENHUMA parcela vencida — só assim é "adimplente" de verdade.
      NOT: { parcelas: { some: { paid: false, renegociada: false, dueDate: { lt: hoje } } } },
      // "Não perturbe" (item 98) pausa qualquer automação, mesmo pra adimplente.
      OR: [{ naoPerturbarAte: null }, { naoPerturbarAte: { lte: new Date() } }],
    },
    include: { parcelas: { where: { paid: false, renegociada: false }, orderBy: { dueDate: "asc" } } },
  });
  if (!contatos.length) return;

  const numeros = await prisma.whatsappNumber.findMany({ where: { estadosCobranca: { not: null } } });
  if (!numeros.length) return;

  const { sendWhatsappText } = await import("@/lib/evolution");

  let enviouAlgum = false;
  const avisouLimite = new Set();
  for (const contact of contatos) {
    const parcela = contact.parcelas[0];
    if (!parcela) continue;

    const already = await prisma.pixAdimplenteLog
      .findUnique({ where: { contactId_dia: { contactId: contact.id, dia: hoje } } })
      .catch(() => null);
    if (already) continue;

    const uf = ufFromPhone(contact.phone);
    if (!uf) continue;
    const numero = numeros.find((n) =>
      (n.estadosCobranca || "").split(",").map((s) => s.trim().toUpperCase()).includes(uf)
    );
    if (!numero) continue;

    if (await atingiuLimite(numero)) {
      if (!avisouLimite.has(numero.instance)) {
        avisouLimite.add(numero.instance);
        console.warn(`[pixAdimplentes] ${numero.label}: limite de aquecimento atingido, pulando envios`);
      }
      continue;
    }

    let pixPayload;
    try {
      pixPayload = gerarPixCopiaECola({
        chave: cfg.pixChave,
        nome: cfg.pixNomeRecebedor,
        cidade: cfg.pixCidade,
        valor: parcela.amount,
        txid: `p${parcela.number}${parcela.id.slice(-8)}`,
      });
    } catch {
      continue; // chave Pix mal configurada — não trava a checagem inteira por isso
    }

    const mensagem = interpolarVariaveis(cfg.pixAdimplentesMensagem || MENSAGEM_PADRAO, contact, {
      pixCopiaCola: pixPayload,
    });

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
    if (result.ok) {
      await prisma.pixAdimplenteLog.create({ data: { contactId: contact.id, dia: hoje } }).catch(() => {});
    }
  }
}
