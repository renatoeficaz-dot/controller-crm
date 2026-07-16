import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { testWahaConnection } from "@/lib/waha";

// Testa a URL + API Key do WAHA salvas (botão "Testar conexão" em Números).
export async function POST() {
  const cfg = await prisma.config.findUnique({ where: { id: "singleton" } });
  const result = await testWahaConnection(cfg?.wahaUrl, cfg?.wahaApiKey);
  return NextResponse.json(result);
}
