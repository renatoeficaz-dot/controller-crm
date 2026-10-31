import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { registrarAuditoria } from "@/lib/auditoria";

// Recebe do navegador o aviso "o Chat travou" (clique que demorou, tarefa longa) e grava na auditoria
// (acao "travada_chat") pra dar pra ver quando/quanto/em que aparelho acontece.
export async function POST(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const ms = Math.round(Number(b.ms) || 0);
  if (!(ms > 0)) return NextResponse.json({ ok: false }, { status: 400 });
  const detalhe = `${String(b.tipo || "clique").slice(0, 20)} ${ms}ms | msgs:${Number(b.msgs) || 0} | ${b.mobile ? "mobile" : "desktop"} | mem:${Number(b.memMb) || "?"}MB | ${String(b.ua || "").slice(0, 80)}`;
  await registrarAuditoria({ usuario: session.name, acao: "travada_chat", entidade: "Chat", entidadeId: String(b.contactId || "").slice(0, 40), detalhe });
  return NextResponse.json({ ok: true });
}
