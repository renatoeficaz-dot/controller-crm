import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser, veTodosLeads, mensagensWhere } from "@/lib/session";

// Total de mensagens não lidas visíveis pro usuário (item 90) — pro selo no
// menu lateral. Leve de propósito: só conta, não traz os contatos inteiros.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ total: 0 });

  const contactWhere = {
    excluidoEm: null,
    ...(veTodosLeads(user) ? {} : { responsavel: user?.name || "__none__" }),
  };
  const msgWhere = mensagensWhere(user);

  const total = await prisma.message.count({
    where: {
      fromMe: false,
      readAt: null,
      contact: contactWhere,
      ...(msgWhere || {}),
    },
  });
  return NextResponse.json({ total });
}
