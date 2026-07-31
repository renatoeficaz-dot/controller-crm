import { NextResponse } from "next/server";
import { rankingPeriodo } from "@/lib/ranking";
import { hojeStr, somarDias, diasDoMes } from "@/lib/metas";

// ?periodo=semana|mes|3meses|tudo (padrão: mes)
export async function GET(req) {
  const periodo = new URL(req.url).searchParams.get("periodo") || "mes";
  const hoje = hojeStr();
  const diasMes = diasDoMes(hoje);

  let inicio;
  if (periodo === "semana") inicio = somarDias(hoje, -6);
  else if (periodo === "3meses") inicio = somarDias(hoje, -89);
  else if (periodo === "tudo") inicio = "2020-01-01";
  else inicio = diasMes[0];

  const ranking = await rankingPeriodo(inicio, hoje);
  return NextResponse.json({ periodo, inicio, fim: hoje, ranking });
}
