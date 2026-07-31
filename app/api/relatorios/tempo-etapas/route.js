import { NextResponse } from "next/server";
import { tempoMedioPorEtapa } from "@/lib/tempoEtapas";

export async function GET() {
  const dados = await tempoMedioPorEtapa();
  return NextResponse.json(dados);
}
