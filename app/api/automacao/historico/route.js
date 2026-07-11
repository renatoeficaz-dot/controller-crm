import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Histórico de atribuições automáticas de responsável (mais recente primeiro).
export async function GET() {
  const logs = await prisma.atribuicaoLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json(logs);
}
