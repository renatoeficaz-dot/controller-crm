import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/session";

// Quem está aprovado esperando o dinheiro sair, cruzado com o saldo em caixa —
// quando entra dinheiro, mostra quem já pode ser atendido e até onde dá.
export async function GET() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const stage = await prisma.stage.findFirst({ where: { name: "Liberação pagamento" } });
  if (!stage) return NextResponse.json({ saldo: 0, fila: [], totalNecessario: 0 });

  const [contatos, entradas, saidas] = await Promise.all([
    prisma.contact.findMany({
      where: { stageId: stage.id },
      orderBy: { updatedAt: "asc" }, // quem está esperando há mais tempo primeiro
      select: {
        id: true,
        name: true,
        phone: true,
        valorCapital: true,
        puxadaScore: true,
        puxadaRisco: true,
        cicloAtual: true,
        updatedAt: true,
      },
    }),
    prisma.lancamento.aggregate({ where: { type: "entrada" }, _sum: { amount: true } }),
    prisma.lancamento.aggregate({ where: { type: "saida" }, _sum: { amount: true } }),
  ]);

  const saldo = (entradas._sum.amount || 0) - (saidas._sum.amount || 0);

  // Marca até onde o saldo alcança, na ordem da fila — deixa explícito quem dá
  // pra atender agora e quem depende de entrar mais dinheiro.
  let acumulado = 0;
  const hoje = Date.now();
  const fila = contatos.map((c) => {
    const valor = c.valorCapital || 0;
    acumulado += valor;
    return {
      ...c,
      diasEsperando: Math.floor((hoje - new Date(c.updatedAt).getTime()) / 86400000),
      acumulado,
      cabeNoSaldo: acumulado <= saldo,
    };
  });

  return NextResponse.json({
    saldo,
    fila,
    totalNecessario: acumulado,
    quantosCabem: fila.filter((f) => f.cabeNoSaldo).length,
  });
}
