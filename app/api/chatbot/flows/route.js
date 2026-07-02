import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Lista os fluxos de chatbot cadastrados
export async function GET() {
  const flows = await prisma.chatbotFlow.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(flows);
}

// Cria um novo fluxo (vazio, pra editar no construtor visual)
export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const name = (body.name || "").trim() || "Novo fluxo";
  const flow = await prisma.chatbotFlow.create({
    data: { name, nodesJson: "[]", edgesJson: "[]" },
  });
  return NextResponse.json(flow);
}
