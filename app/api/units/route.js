import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Lista as unidades/empresas
export async function GET() {
  const units = await prisma.unit.findMany({ orderBy: { number: "asc" } });
  return NextResponse.json(units);
}

// Cria uma nova unidade
export async function POST(req) {
  const body = await req.json();
  const last = await prisma.unit.findFirst({ orderBy: { number: "desc" } });
  const unit = await prisma.unit.create({
    data: {
      number: body.number ?? (last?.number ?? 0) + 1,
      name: body.name || "Nova unidade",
      cn: body.cn || "/1/",
      location: body.location || "Brasil, São Paulo",
      status: body.status || "open",
      caixaInicial: body.caixaInicial ?? 0,
      caixaFinal: body.caixaFinal ?? 0,
      progresso: body.progresso ?? 0,
      pin: body.pin || null,
      appVersion: body.appVersion || null,
    },
  });
  return NextResponse.json(unit);
}
