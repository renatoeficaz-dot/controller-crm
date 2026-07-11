import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser, veTodosLeads, mensagensWhere } from "@/lib/session";

// Lista conversas do usuário (contatos com mensagens, ordenados pela mais recente).
// Cada item traz o contato + última mensagem + contagem de não lidas + dados
// usados pelos filtros da tela de Chat (etapa, tags, parcelas, número de origem).
export async function GET() {
  const user = await getCurrentUser();
  const contactWhere = veTodosLeads(user) ? {} : { responsavel: user?.name || "__none__" };
  const msgWhere = mensagensWhere(user);

  const contacts = await prisma.contact.findMany({
    where: { ...contactWhere, messages: { some: msgWhere || {} } },
    select: {
      id: true,
      name: true,
      phone: true,
      responsavel: true,
      stageId: true,
      stage: { select: { id: true, name: true } },
      tags: { select: { id: true, name: true, color: true } },
      parcelas: { select: { dueDate: true, paid: true, ciclo: true } },
      cicloAtual: true,
      messages: {
        where: msgWhere,
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, kind: true, fromMe: true, createdAt: true, instance: true },
      },
      _count: {
        select: { messages: { where: { fromMe: false, readAt: null, ...(msgWhere || {}) } } },
      },
    },
  });

  const result = contacts
    .map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      responsavel: c.responsavel,
      stageId: c.stageId,
      stageName: c.stage?.name || null,
      tags: c.tags,
      parcelas: c.parcelas,
      cicloAtual: c.cicloAtual,
      instance: c.messages[0]?.instance || null,
      lastMessage: c.messages[0] || null,
      unreadCount: c._count?.messages || 0,
    }))
    .sort((a, b) => {
      const da = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt) : 0;
      const db = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt) : 0;
      return db - da;
    });

  return NextResponse.json(result);
}
