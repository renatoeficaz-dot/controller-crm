import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { lerCorpo } from "@/lib/corpo";

// Lista os agentes de IA cadastrados
export async function GET() {
  const agents = await prisma.iaAgent.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json(agents);
}

// Cria um novo agente
export async function POST(req) {
  const body = await lerCorpo(req);
  const name = (body.name || "").trim() || "Novo agente";
  const agent = await prisma.iaAgent.create({ data: { name } });
  return NextResponse.json(agent);
}
