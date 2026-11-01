import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

// Quem está ligando: acha o lead pelo telefone (últimos 8 dígitos) para mostrar o nome na chamada recebida.
export async function GET(req) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const fim = String(new URL(req.url).searchParams.get("phone") || "").replace(/\D/g, "").slice(-8);
  if (fim.length < 8) return NextResponse.json({ contato: null });
  const c = await prisma.contact.findFirst({ where: { phone: { endsWith: fim }, excluidoEm: null }, orderBy: { updatedAt: "desc" }, select: { id: true, name: true, phone: true } });
  return NextResponse.json({ contato: c });
}
