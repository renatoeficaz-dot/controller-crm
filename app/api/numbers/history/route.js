import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Histórico de conexão/desconexão de todos os números (mais recente primeiro).
export async function GET() {
  const logs = await prisma.conexaoLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { numero: { select: { id: true, label: true, number: true } } },
  });
  return NextResponse.json(logs);
}
