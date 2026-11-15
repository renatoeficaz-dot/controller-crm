import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { lerCorpo, texto } from "@/lib/corpo";
import { getCurrentUser, isAdmin } from "@/lib/session";

// Lista os agentes de IA cadastrados
export async function GET() {
  // Os prompts completos dos agentes (regras de crédito, de cobrança, de análise) são o "manual" da operação: só a tela de Configurações usa, e respondia pra qualquer usuário logado.
  if (!isAdmin(await getCurrentUser())) return NextResponse.json({ error: "Só o administrador." }, { status: 403 });
  const agents = await prisma.iaAgent.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json(agents);
}

// Cria um novo agente
export async function POST(req) {
  const body = await lerCorpo(req);
  const name = texto(body.name) || "Novo agente";
  const agent = await prisma.iaAgent.create({ data: { name } });
  return NextResponse.json(agent);
}
