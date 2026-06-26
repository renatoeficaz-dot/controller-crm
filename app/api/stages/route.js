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
        },
      },
    },
  });
  return NextResponse.json(stages);
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
