import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { lerCorpo } from "@/lib/corpo";

// Transferência entre contas (item 133) = uma saída na origem + uma entrada
// no destino, mesmo valor, vinculadas por transferenciaId — pra achar o par
// depois e não deixar editar/excluir um lado sem avisar do outro.
export async function POST(req) {
  const { origemId, destinoId, valor, descricao, date } = await lerCorpo(req);
  if (!origemId || !destinoId || origemId === destinoId) {
    return NextResponse.json({ error: "Escolha duas contas diferentes." }, { status: 400 });
  }
  const v = Number(valor);
  if (!v || v <= 0) return NextResponse.json({ error: "Valor inválido." }, { status: 400 });

  const [origem, destino] = await Promise.all([
    prisma.banco.findUnique({ where: { id: origemId } }),
    prisma.banco.findUnique({ where: { id: destinoId } }),
  ]);
  if (!origem || !destino) return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });

  const transferenciaId = randomUUID();
  const desc = descricao?.trim() || `Transferência: ${origem.name} → ${destino.name}`;
  // "YYYY-MM-DD" puro vira meia-noite UTC — em fuso negativo (Brasil) isso
  // exibe um dia ANTES do que foi escolhido. Meio-dia evita virar o dia.
  const data = date ? new Date(date + "T12:00:00") : new Date();

  const [saida, entrada] = await prisma.$transaction([
    prisma.lancamento.create({ data: { type: "saida", amount: v, description: desc, date: data, bancoId: origemId, transferenciaId } }),
    prisma.lancamento.create({ data: { type: "entrada", amount: v, description: desc, date: data, bancoId: destinoId, transferenciaId } }),
  ]);

  return NextResponse.json({ saida, entrada });
}
