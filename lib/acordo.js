import { prisma } from "@/lib/prisma";

// Numeração das parcelas geradas por acordo começa em 1000 pra nunca colidir
// com o plano original (1..10) — o número serve só de rótulo, e assim continua
// óbvio na lista o que é acordo e o que é parcela original.
const BASE_NUMERO_ACORDO = 1000;

function diaUTC(str) {
  return new Date(String(str).slice(0, 10) + "T00:00:00.000Z");
}

// Cria um acordo parcelado: as parcelas em aberto do ciclo atual são marcadas
// como renegociadas (saem da cobrança e do "em aberto") e o valor combinado
// vira N novas parcelas. Não mexe no que já foi pago.
//
// O valor do acordo pode ser MENOR que o total em aberto (desconto embutido na
// negociação) — é justamente o caso de uso: recuperar parte vale mais que
// insistir num valor cheio que não vem.
export async function criarAcordoParcelado({ contactId, valorTotal, parcelas, primeiroVencimento, intervaloDias = 30, usuario, notas }) {
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    include: { parcelas: true },
  });
  if (!contact) return { error: "Contato não encontrado.", status: 404 };

  const n = Number(parcelas);
  const total = Number(valorTotal);
  if (!n || n < 1 || n > 36) return { error: "O acordo deve ter de 1 a 36 parcelas.", status: 400 };
  if (!total || total <= 0) return { error: "Informe o valor total do acordo.", status: 400 };
  if (!primeiroVencimento) return { error: "Informe o vencimento da primeira parcela.", status: 400 };

  const ciclo = contact.cicloAtual || 1;
  const emAberto = contact.parcelas.filter((p) => (p.ciclo || 1) === ciclo && !p.paid && !p.renegociada);
  if (emAberto.length === 0) {
    return { error: "Não há parcelas em aberto pra renegociar.", status: 400 };
  }
  const valorOriginal = emAberto.reduce((s, p) => s + p.amount, 0);

  // Divide o total em N parcelas; a diferença de arredondamento vai na última
  // pra soma fechar exatamente com o valor combinado.
  const base = Math.floor((total / n) * 100) / 100;
  const valores = Array.from({ length: n }, () => base);
  valores[n - 1] = Math.round((total - base * (n - 1)) * 100) / 100;

  await prisma.$transaction(async (tx) => {
    // Tarefas de cobrança das parcelas antigas não fazem mais sentido.
    await tx.task.deleteMany({ where: { contactId, parcelaId: { in: emAberto.map((p) => p.id) } } });
    await tx.parcela.updateMany({
      where: { id: { in: emAberto.map((p) => p.id) } },
      data: { renegociada: true },
    });

    const inicio = diaUTC(primeiroVencimento);
    for (let i = 0; i < n; i++) {
      const venc = new Date(inicio);
      venc.setUTCDate(venc.getUTCDate() + i * Number(intervaloDias || 30));
      const parcela = await tx.parcela.create({
        data: {
          contactId,
          number: BASE_NUMERO_ACORDO + i + 1,
          dueDate: venc,
          amount: valores[i],
          ciclo,
          deAcordo: true,
        },
      });
      await tx.task.create({
        data: {
          contactId,
          parcelaId: parcela.id,
          title: `Cobrar ${i + 1}ª parcela do acordo de ${contact.name}`,
          dueDate: new Date(venc.toISOString().slice(0, 10) + "T11:00:00"),
        },
      });
    }

    await tx.negociacao.create({
      data: {
        contactId,
        tipo: "acordo_parcelado",
        valorOriginal,
        valorNegociado: total,
        parcelas: n,
        aceito: true,
        usuario: usuario || null,
        notas: notas || null,
      },
    });
  });

  return { ok: true, valorOriginal, valorNegociado: total, parcelas: n };
}
