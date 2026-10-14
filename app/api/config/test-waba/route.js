import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { testarAppWaba } from "@/lib/waba";

// Botão "Testar app" em Números → WABA: confere se App ID + App Secret são aceitos pela Meta.
export async function POST() {
  if (!isAdmin(await getCurrentUser().catch(() => null))) return NextResponse.json({ error: "Só administrador." }, { status: 403 });
  return NextResponse.json(await testarAppWaba());
}
