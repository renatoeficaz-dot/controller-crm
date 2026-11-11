import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Webhook do Checkout Integrado InfinitePay: link pago -> baixa automática.
// Não é assinado: a URL leva um token secreto (?t=) e o pagamento é CONFIRMADO no payment_check antes da baixa.
// 200 = recebido (inclusive repetido); 400 = recusado de vez. A baixa roda em fila para responder rápido.
export async function POST(req) {
  const t = new URL(req.url).searchParams.get("t") || "";
  const c = await prisma.config.findUnique({ where: { id: "singleton" }, select: { infinitepayWebhookToken: true } });
  const certo = c?.infinitepayWebhookToken || "";
  const a = Buffer.from(t), b = Buffer.from(certo);
  if (!certo || a.length !== b.length || !crypto.timingSafeEqual(a, b)) return NextResponse.json({ ok: false }, { status: 403 });
  const payload = await req.json().catch(() => null);
  if (!payload) return NextResponse.json({ ok: false }, { status: 400 });
  const P = await import("@/lib/linkPagamentoServidor");
  // Espera até 8 s pela baixa (a InfinitePay re-tenta se não vier 2xx); se demorar mais, a fila termina sozinha.
  const r = await Promise.race([P.processarWebhook(payload), new Promise((ok) => setTimeout(() => ok({ ok: true, motivo: "em andamento" }), 8000))]);
  console.log("[infinitepay] webhook:", r?.motivo);
  return NextResponse.json({ ok: true });
}
