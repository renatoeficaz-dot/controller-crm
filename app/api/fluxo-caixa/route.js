import { NextResponse } from "next/server";
import { projecaoFluxoCaixa } from "@/lib/fluxoCaixa";

export async function GET(req) {
  const dias = Number(new URL(req.url).searchParams.get("dias")) || 30;
  const projecao = await projecaoFluxoCaixa(Math.min(90, Math.max(7, dias)));
  return NextResponse.json(projecao);
}
