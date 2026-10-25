import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { lerCorpo, ehNaoEncontrado, respostaNaoEncontrado } from "@/lib/corpo";
import { sincronizarUltimaRecarga } from "@/lib/chips";

// Registra uma recarga nova no histórico do chip (e atualiza a "última recarga").
export async function POST(req, { params }) {
  try {
    const { id } = await params;
    const body = await lerCorpo(req);
    const data = new Date(`${String(body.data || "").slice(0, 10)}T12:00:00`);
    const valor = Number(body.valor);
    if (isNaN(data.getTime())) return NextResponse.json({ error: "Data inválida." }, { status: 400 });
    if (!isFinite(valor) || valor < 0) return NextResponse.json({ error: "Valor inválido." }, { status: 400 });
    const chip = await prisma.chip.findUnique({ where: { id }, select: { id: true } });
    if (!chip) return respostaNaoEncontrado();
    const rec = await prisma.chipRecarga.create({ data: { chipId: id, data, valor } });
    await sincronizarUltimaRecarga(prisma, id);
    return NextResponse.json(rec);
  } catch (err) {
    if (ehNaoEncontrado(err)) return respostaNaoEncontrado();
    throw err;
  }
}
