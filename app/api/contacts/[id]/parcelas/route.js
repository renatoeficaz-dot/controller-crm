import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { regenerarParcelas } from "@/lib/cobranca";

// Lista as parcelas do contato
export async function GET(_req, { params }) {
  const { id } = await params;
  const parcelas = await prisma.parcela.findMany({
    where: { contactId: id },
    orderBy: { number: "asc" },
  });
  return NextResponse.json(parcelas);
}

// (Re)gera manualmente as 10 parcelas diárias + tarefas (1ª cobrança = pagamento de capital + 1 dia)
export async function POST(_req, { params }) {
  const { id } = await params;
  const result = await regenerarParcelas(id);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status || 400 });
  }
  return NextResponse.json(result.parcelas);
}
