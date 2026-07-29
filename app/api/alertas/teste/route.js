import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { enviarTeste } from "@/lib/alertas";

export const runtime = "nodejs";

export async function POST() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  const r = await enviarTeste();
  if (!r?.ok) return NextResponse.json({ error: r?.error || "Falha ao enviar." }, { status: 400 });
  return NextResponse.json({ ok: true });
}
