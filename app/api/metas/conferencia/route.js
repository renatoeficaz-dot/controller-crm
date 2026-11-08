import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { divergenciasRecentes } from "@/lib/auditoriaMetas";

// Avisos da conferência automática das metas (de hora em hora) das últimas 24 h, para a faixa no rodapé dos admins.
// Só admin vê: são números da empresa toda.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  return NextResponse.json({ divergencias: await divergenciasRecentes(24) });
}
