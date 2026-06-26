import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser, veTodosLeads, mensagensWhere } from "@/lib/session";

// Lista conversas do usuário (contatos com mensagens, ordenados pela mais recente).
// Cada item traz o contato + última mensagem + contagem de não lidas.
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
      messages: {
        where: msgWhere,
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, kind: true, fromMe: true, createdAt: true },
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
