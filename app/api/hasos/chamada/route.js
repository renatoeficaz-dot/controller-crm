import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { hasosFetch } from "@/lib/hasos";

// Situação de UMA chamada na Hasos pelo id do WhatsApp (o mesmo `id` da oferta do discador): quem ligou (peerPhone),
// se ainda toca e como terminou. O discador não informa o telefone de quem liga — só o histórico de chamadas da conta.
//   GET ?id=<id da oferta>
export async function GET(req) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const id = String(new URL(req.url).searchParams.get("id") || "");
  if (!id) return NextResponse.json({ chamada: null });
  const r = await hasosFetch("/v1/calls?limit=25");
  if (!r.ok) return NextResponse.json({ chamada: null, erro: r.erro });
  const lista = Array.isArray(r.data?.calls) ? r.data.calls : Array.isArray(r.data) ? r.data : [];
  const c = lista.find((x) => x.whatsappCallId === id || x.id === id);
  return NextResponse.json({
    chamada: c ? { peerPhone: c.peerPhone || null, status: c.status || null, endReason: c.endReason || null, direction: c.direction || null, durationSec: c.durationSec ?? null } : null,
  });
}
