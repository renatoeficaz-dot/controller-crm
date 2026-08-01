import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { relatorioIntegridade } from "@/lib/integridade";

// Itens 155, 156, 157: painel de integridade de dados — só admin.
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const relatorio = await relatorioIntegridade();
  return NextResponse.json(relatorio);
}
