import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";

// Total de mensagens não lidas do chat interno (de todas as conversas do usuário) — alimenta a bolinha
// vermelha no menu do topo. Uma consulta só, porque roda a cada poucos segundos em todas as telas.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ total: 0 });
  const r = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS n
       FROM "MensagemInterna" m
       JOIN "ConversaInternaMembro" cm ON cm."conversaId" = m."conversaId" AND cm."userId" = ?
      WHERE m."autorId" != ? AND m."apagada" = 0 AND (cm."lidoAte" IS NULL OR m."createdAt" > cm."lidoAte")`,
    user.id,
    user.id
  ).catch(() => [{ n: 0 }]);
  return NextResponse.json({ total: Number(r?.[0]?.n || 0) });
}
