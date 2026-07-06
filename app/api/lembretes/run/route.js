import { NextResponse } from "next/server";
import { checarLembretesCobranca } from "@/lib/lembreteCobranca";

// Dispara manualmente a checagem de lembretes de cobrança (a mesma que roda
// automaticamente a cada 5 min via instrumentation.js). Útil pra testar.
export async function POST() {
  await checarLembretesCobranca();
  return NextResponse.json({ ok: true });
}
