import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser, kanbansVisiveis, veTodosLeads } from "@/lib/session";

// Lista as colunas do Kanban com seus contatos, respeitando as permissões do usuário:
// - colunas: só as que ele pode ver (admin/sem restrição = todas)
// - leads: só os dele (responsável) quando não tem permissão de ver todos
export async function GET() {
  const user = await getCurrentUser();
  const colunas = kanbansVisiveis(user); // null = todas
  const contactWhere = veTodosLeads(user) ? {} : { responsavel: user?.name || "__none__" };

  const stages = await prisma.stage.findMany({
    where: colunas ? { id: { in: colunas } } : {},
    orderBy: { order: "asc" },
    include: {
      contacts: {
        where: contactWhere,
        orderBy: { order: "asc" },
        include: {
          parcelas: { orderBy: { number: "asc" } },
          tags: { select: { id: true, name: true, color: true } },
          _count: { select: { messages: { where: { fromMe: false, readAt: null } } } },
          messages: {
            where: { fromMe: false, readAt: null },
            orderBy: { createdAt: "asc" },
            take: 1,
            select: { createdAt: true },
          },
        },
      },
    },
  });

  // Enriquece com unreadCount e oldestUnread, e ordena por mensagem mais antiga não lida
  const enriched = stages.map((s) => ({
    ...s,
    contacts: s.contacts
      .map((c) => ({
        ...c,
        unreadCount: c._count?.messages || 0,
        oldestUnread: c.messages?.[0]?.createdAt || null,
        messages: undefined,
        _count: undefined,
      }))
      .sort((a, b) => {
        if (a.oldestUnread && !b.oldestUnread) return -1;
        if (!a.oldestUnread && b.oldestUnread) return 1;
        if (a.oldestUnread && b.oldestUnread) return new Date(a.oldestUnread) - new Date(b.oldestUnread);
        return 0;
      }),
  }));
  return NextResponse.json(enriched);
}

// Cria uma nova coluna
export async function POST(req) {
  const body = await req.json();
  const last = await prisma.stage.findFirst({ orderBy: { order: "desc" } });
  const stage = await prisma.stage.create({
    data: {
      name: body.name || "Nova coluna",
      color: body.color || "#64748b",
      order: (last?.order ?? -1) + 1,
    },
  });
  return NextResponse.json(stage);
}
