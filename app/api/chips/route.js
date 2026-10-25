import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { lerCorpo } from "@/lib/corpo";
import { dadosChip } from "@/lib/chips";

export async function GET() {
  const chips = await prisma.chip.findMany({ orderBy: { createdAt: "asc" }, include: { recargas: { orderBy: { data: "desc" } } } });
  return NextResponse.json(chips);
}

export async function POST(req) {
  const body = await lerCorpo(req);
  const { data, erro } = dadosChip(body, false);
  if (erro) return NextResponse.json({ error: erro }, { status: 400 });
  const chip = await prisma.chip.create({ data });
  return NextResponse.json(chip);
}
