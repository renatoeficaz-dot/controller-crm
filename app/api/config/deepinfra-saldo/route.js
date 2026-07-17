import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getDeepInfraSaldo } from "@/lib/deepinfra";

// Saldo atual da conta DeepInfra (texto/transcrição/voz da IA) — usado no
// card de Configurações e no aviso de saldo baixo no rodapé.
export async function GET() {
  const cfg = await prisma.config.findUnique({ where: { id: "singleton" } });
  const result = await getDeepInfraSaldo(cfg?.deepinfraApiKey);
  return NextResponse.json(result);
}
