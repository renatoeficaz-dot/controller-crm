import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { instanceState } from "@/lib/evolution";

// Estado de conexão de TODOS os números — usado pelo aviso fixo no rodapé
// (ConnectionStatusBanner), que fica visível enquanto qualquer número estiver
// desconectado.
export async function GET() {
  const cfg = await prisma.config.findUnique({ where: { id: "singleton" } });
  const base = cfg?.evolutionUrl || process.env.EVOLUTION_API_URL || "";
  const apikey = cfg?.evolutionApiKey || process.env.EVOLUTION_API_KEY || "";

  const numeros = await prisma.whatsappNumber.findMany({
    select: { id: true, label: true, number: true, instance: true },
  });

  const status = await Promise.all(
    numeros.map(async (n) => ({
      id: n.id,
      label: n.label,
      number: n.number,
      state: await instanceState(base, apikey, n.instance),
    }))
  );

  return NextResponse.json(status);
}
