import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { enviadasHoje, limiteDoDia, diasDeAquecimento } from "@/lib/aquecimento";

export async function GET(_req, { params }) {
  const { id } = await params;
  const numero = await prisma.whatsappNumber.findUnique({ where: { id } });
  if (!numero) return NextResponse.json({ error: "Número não encontrado." }, { status: 404 });

  return NextResponse.json({
    enviadas: await enviadasHoje(numero.instance),
    limite: limiteDoDia(numero),
    dia: diasDeAquecimento(numero),
  });
}
