import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function PATCH(req, { params }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const type = body.type;
  const amount = Number(body.amount);
  if (!["entrada", "saida"].includes(type) || !amount || amount <= 0) {
    return NextResponse.json({ error: "Tipo (entrada/saida) e valor positivo obrigatórios." }, { status: 400 });
  }
  const lanc = await prisma.lancamento.update({
    where: { id },
    data: {
      type,
      amount,
      description: (body.description || "").trim() || null,
      date: body.date ? new Date(body.date) : undefined,
      categoriaId: body.categoriaId || null,
      bancoId: body.bancoId || null,
      contactId: body.contactId || null,
    },
    include: {
      categoria: { select: { id: true, name: true, type: true } },
      banco: { select: { id: true, name: true } },
      contact: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json(lanc);
}

export async function DELETE(_req, { params }) {
  const { id } = await params;
  try {
    await prisma.lancamento.delete({ where: { id } });
  } catch (err) {
    // P2025 = já não existe (ex.: excluído de novo por um segundo clique, ou
    // o "desfazer" de 5s já tinha rodado) — o resultado que importa (não
    // existir mais) já está garantido, então trata como sucesso.
    if (err.code !== "P2025") {
      return NextResponse.json({ error: "Erro ao excluir o lançamento." }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true });
}
