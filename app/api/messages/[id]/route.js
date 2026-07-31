import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// "Apagar" (item 88) só some da NOSSA visualização — sem API confiável de
// "apagar dos dois lados" testável sem acesso ao provedor ao vivo.
export async function PATCH(req, { params }) {
  const { id } = await params;
  const { apagada } = await req.json();
  const message = await prisma.message.update({ where: { id }, data: { apagada: !!apagada } });
  return NextResponse.json(message);
}
