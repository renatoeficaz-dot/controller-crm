import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { testEvolutionConnection } from "@/lib/evolution";

// Testa a URL + API Key salvas (botão "Testar conexão" em Números).
export async function POST() {
  const cfg = await prisma.config.findUnique({ where: { id: "singleton" } });
  const result = await testEvolutionConnection(cfg?.evolutionUrl, cfg?.evolutionApiKey);
  return NextResponse.json(result);
}
