import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { statusCatta } from "@/lib/catta";

// Créditos e situação da conta na Catta (não gasta crédito) — só admin.
export async function GET() {
  const user = await getCurrentUser().catch(() => null);
  if (!isAdmin(user)) return NextResponse.json({ ok: false, erro: "Sem permissão." }, { status: 403 });
  return NextResponse.json(await statusCatta());
}
