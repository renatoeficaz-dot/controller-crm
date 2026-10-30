import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

// Monta a URL do Click To Call da Wavoip. O token fica só no servidor (quem não é
// admin recebe "***" do /api/config), o navegador só recebe a URL pronta pra abrir.
//   GET ?phone=5511999999999&name=Fulano
export async function GET(req) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  let phone = String(sp.get("phone") || "").replace(/\D/g, "");
  if (phone.length === 10 || phone.length === 11) phone = "55" + phone;
  if (phone.length < 12) return NextResponse.json({ error: "Telefone inválido." }, { status: 400 });
  const cfg = await prisma.config.findUnique({ where: { id: "singleton" }, select: { wavoipToken: true } });
  const token = (cfg?.wavoipToken || "").trim();
  if (!token) return NextResponse.json({ url: null });
  const q = new URLSearchParams({ token, phone, start_if_ready: "true", available_after_call: "false", close_after_call: "true" });
  const name = String(sp.get("name") || "").trim();
  if (name) q.set("name", name);
  return NextResponse.json({ url: `https://app.wavoip.com/call?${q.toString()}` });
}
