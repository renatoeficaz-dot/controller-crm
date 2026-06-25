import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Lista todas as colunas do Kanban com seus contatos
export async function GET() {
  const stages = await prisma.stage.findMany({
    orderBy: { order: "asc" },
    include: {
      contacts: {
        orderBy: { order: "asc" },
        include: { parcelas: { orderBy: { number: "asc" } } },
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
