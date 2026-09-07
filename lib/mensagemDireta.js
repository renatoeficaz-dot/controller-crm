import { prisma } from "@/lib/prisma";

// Manda uma mensagem do sistema na conversa direta com um usuário — cria a
// conversa se ainda não existir. Usado pelos relatórios automáticos de
// sábado (acerto de cobrador, comissão percentual...).
export async function enviarMensagemDireta(userId, texto) {
  // Quem "assina" a mensagem precisa ser OUTRA pessoa: se o próprio
  // destinatário fosse o autor, a mensagem nasceria como lida e ele nunca
  // receberia o aviso (e uma conversa direta consigo mesmo não existe).
  const admin = await prisma.user.findFirst({
    where: { role: "admin", id: { not: userId } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (!admin) return;

  // Conversa direta entre os dois: exatamente 2 membros e não é grupo.
  const candidatas = await prisma.conversaInterna.findMany({
    where: { grupo: false, membros: { some: { userId } } },
    include: { membros: { select: { userId: true } } },
  });
  let conversa = candidatas.find(
    (c) => c.membros.length === 2 && c.membros.some((m) => m.userId === admin.id)
  );
  if (!conversa) {
    conversa = await prisma.conversaInterna.create({
      data: {
        grupo: false,
        criadaPor: "sistema",
        membros: { create: [{ userId }, { userId: admin.id }] },
      },
      include: { membros: { select: { userId: true } } },
    });
  }

  await prisma.mensagemInterna.create({
    data: { conversaId: conversa.id, autorId: admin.id, body: texto },
  });
  await prisma.conversaInterna.update({
    where: { id: conversa.id },
    data: { updatedAt: new Date() },
  });
}
