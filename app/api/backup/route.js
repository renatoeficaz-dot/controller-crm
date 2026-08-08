import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { listarBackups, rodarBackup } from "@/lib/backup";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  return NextResponse.json(await listarBackups());
}

// Backup manual — o automático roda 1x por dia, mas é útil poder gerar na hora
// antes de uma mudança arriscada.
export async function POST() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  try {
    return NextResponse.json(await rodarBackup());
  } catch (err) {
    // Não devolve err.message pro cliente: erro de backup pode conter caminho
    // de arquivo do servidor ou detalhe do SQLite — fica só no log.
    console.error("[backup] erro:", err.message);
    return NextResponse.json({ error: "Erro ao gerar o backup." }, { status: 500 });
  }
}
