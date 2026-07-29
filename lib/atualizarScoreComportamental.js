import { prisma } from "@/lib/prisma";
import { calcularScoreComportamental } from "@/lib/scoreComportamental";

// Recalcula e grava o score de um contato. Chamado quando uma parcela muda de
// estado (baixa/estorno) — o score só faz sentido se acompanhar o histórico.
export async function atualizarScoreDoContato(contactId) {
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { id: true, parcelas: { select: { paid: true, paidAt: true, dueDate: true, ciclo: true } } },
  });
  if (!contact) return null;

  const { score, motivos } = calcularScoreComportamental(contact);
  await prisma.contact.update({
    where: { id: contactId },
    data: {
      scoreComportamental: score,
      scoreComportMotivos: motivos.join("|") || null,
      scoreComportEm: new Date(),
    },
  });
  return score;
}

// Varre a carteira inteira — roda uma vez por dia, porque parcela que vence e
// não é paga muda o score sem ninguém tocar em nada.
export async function recalcularScoresComportamentais() {
  const contatos = await prisma.contact.findMany({
    where: { parcelas: { some: {} } },
    select: { id: true, parcelas: { select: { paid: true, paidAt: true, dueDate: true, ciclo: true } } },
  });

  for (const c of contatos) {
    const { score, motivos } = calcularScoreComportamental(c);
    await prisma.contact
      .update({
        where: { id: c.id },
        data: {
          scoreComportamental: score,
          scoreComportMotivos: motivos.join("|") || null,
          scoreComportEm: new Date(),
        },
      })
      .catch(() => {});
  }
  return contatos.length;
}
