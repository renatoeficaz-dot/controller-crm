import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { relatorioLigacoesHasos } from "@/lib/hasosLigacoes";

export const dynamic = "force-dynamic";
const diaValido = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "");

// Ligações pela Hasos no período (dias de Brasília): feitas, atendidas, tempo falado e recebidas, por dia, número e colaborador.
export async function GET(req) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const ini = searchParams.get("ini");
  const fim = searchParams.get("fim");
  if (!diaValido(ini) || !diaValido(fim)) return NextResponse.json({ error: "Informe ini e fim (AAAA-MM-DD)." }, { status: 400 });
  const de = new Date(`${ini}T00:00:00-03:00`);
  const ate = new Date(new Date(`${fim}T00:00:00-03:00`).getTime() + 86400e3);
  if (isNaN(de) || isNaN(ate) || ate <= de) return NextResponse.json({ error: "Período inválido." }, { status: 400 });
  return NextResponse.json(await relatorioLigacoesHasos(de, ate));
}
