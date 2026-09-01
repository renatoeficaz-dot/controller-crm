import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";

// Tudo que estão esperando ESTE usuário resolver, de todas as conversas.
// O contador sozinho não dizia o que era — a pessoa tinha que abrir conversa
// por conversa pra descobrir. Urgente primeiro, depois média, depois baixa;
// dentro do mesmo peso, o mais antigo na frente (espera há mais tempo).
const PESO = { urgente: 0, media: 1, baixa: 2 };

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const pendencias = await prisma.mensagemInterna.findMany({
    where: { atribuidoAId: user.id, resolvido: false, apagada: false },
    orderBy: { createdAt: "asc" },
    take: 100,
    include: {
      autor: { select: { id: true, name: true } },
      conversa: { select: { id: true, nome: true, grupo: true, membros: { select: { user: { select: { id: true, name: true } } } } } },
      contact: { select: { id: true, name: true } },
    },
  });

  const itens = pendencias.map((m) => ({
    id: m.id,
    conversaId: m.conversa.id,
    // Conversa direta não tem nome: usa o nome do outro participante, igual
    // a listagem principal faz.
    conversaTitulo: m.conversa.grupo
      ? m.conversa.nome || "Grupo"
      : m.conversa.membros.map((x) => x.user).find((u) => u.id !== user.id)?.name || "Conversa",
    grupo: m.conversa.grupo,
    autor: m.autor?.name || "",
    body: m.body,
    prioridade: m.prioridade || "media",
    lead: m.contact ? { id: m.contact.id, name: m.contact.name } : null,
    mediaKind: m.mediaKind,
    createdAt: m.createdAt,
  }));

  itens.sort((a, b) => (PESO[a.prioridade] ?? 1) - (PESO[b.prioridade] ?? 1));
  return NextResponse.json(itens);
}
