import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Lista os agentes de IA cadastrados
export async function GET() {
  const agents = await prisma.iaAgent.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json(agents);
}

// Cria um novo agente
export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const name = (body.name || "").trim() || "Novo agente";
  const agent = await prisma.iaAgent.create({ data: { name } });
  return NextResponse.json(agent);
}
