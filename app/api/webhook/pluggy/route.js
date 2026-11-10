import { NextResponse } from "next/server";

// Webhook da Pluggy: transação nova/alterada ou item atualizado -> sincroniza a conta em segundo plano.
// A Pluggy não assina o payload: a URL leva um token secreto (?t=) e o clientId do payload tem que ser o nosso.
// Responde rápido (a Pluggy exige 2xx em até 10 s); a sincronização roda depois.
export async function POST(req) {
  const token = new URL(req.url).searchParams.get("t");
  const payload = await req.json().catch(() => ({}));
  const P = await import("@/lib/pluggyServidor");
  if (!(await P.webhookValido(token, payload))) return NextResponse.json({ ok: false }, { status: 403 });
  const evento = String(payload?.event || "");
  if (/^transactions\/|^item\/(updated|created|login_succeeded)$/.test(evento)) {
    setTimeout(() => P.sincronizarPluggy().catch((e) => console.error("[pluggy] webhook:", e.message)), 2000).unref?.();
  }
  return NextResponse.json({ ok: true });
}
