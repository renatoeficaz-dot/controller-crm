import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser, kanbansVisiveis, veTodosLeads } from "@/lib/session";

// Lista as colunas do Kanban com seus contatos, respeitando as permissões do usuário:
// - colunas: só as que ele pode ver (admin/sem restrição = todas)
// - leads: só os dele (responsável) quando não tem permissão de ver todos
export async function GET() {
  const user = await getCurrentUser();
  let colunas = kanbansVisiveis(user); // null = todas

  // Cobrador precisa sempre enxergar "Recebimento" pra poder dar baixa nas
  // parcelas, mesmo que a configuração de colunas visíveis dele não inclua —
  // é o trabalho dele, não deveria depender de configuração manual.
  if (user?.role === "cobrador" && colunas) {
    const recebimento = await prisma.stage.findFirst({ where: { name: "Recebimento" } });
    if (recebimento && !colunas.includes(recebimento.id)) colunas = [...colunas, recebimento.id];
  }

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
          campanha: { select: { id: true, nome: true, regiao: true } },
          _count: { select: { messages: { where: { fromMe: false, readAt: null } }, tasks: true } },
          tasks: { where: { done: false }, select: { dueDate: true } },
          // take: 50 (e não 1) porque além do horário da última mensagem o
          // relatório precisa saber se o lead JÁ respondeu alguma vez — só o
          // fromMe da última mensagem não diz isso.
          messages: {
            orderBy: { createdAt: "desc" },
            take: 50,
            select: { createdAt: true, fromMe: true },
          },
        },
      },
    },
  });

  // Enriquece com unreadCount, tasksCount (pra alertar lead em Recebimento sem
  // nenhuma tarefa de cobrança), tarefasPendentes (datas das tarefas em aberto,
  // pro filtro de atrasada/hoje/a vencer no front) e o horário da última
  // mensagem (de qualquer direção) — o front ordena os cards por isso (mais
  // recente ou mais antiga primeiro, conforme o filtro escolhido).
  const enriched = stages.map((s) => ({
    ...s,
    contacts: s.contacts.map((c) => ({
      ...c,
      unreadCount: c._count?.messages || 0,
      tasksCount: c._count?.tasks || 0,
      tarefasPendentes: c.tasks || [],
      lastMessageAt: c.messages?.[0]?.createdAt || c.createdAt,
      respondeu: (c.messages || []).some((m) => !m.fromMe),
      messages: undefined,
      tasks: undefined,
      _count: undefined,
    })),
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
