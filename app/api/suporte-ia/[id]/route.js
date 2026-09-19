import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { lerCorpo } from "@/lib/corpo";

// Marca (ou desmarca) um reporte de erro da IA como resolvido, com uma nota
// opcional do que foi ajustado — fica registrado pra quem revisar depois.
export async function PATCH(req, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Só administrador." }, { status: 403 });
  }
  const { resolvido, notaResolucao } = await lerCorpo(req);
  const item = await prisma.suporteIa.update({
    where: { id },
    data: resolvido
      ? { resolvido: true, resolvidoEm: new Date(), resolvidoPor: user.name, notaResolucao: notaResolucao?.trim() || null }
      : { resolvido: false, resolvidoEm: null, resolvidoPor: null },
  });
  return NextResponse.json(item);
}
