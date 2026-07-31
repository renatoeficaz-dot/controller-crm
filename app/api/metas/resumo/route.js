import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { resumoMetas } from "@/lib/metasResumo";

// Resumo da tela de Metas.
//   ?dia=YYYY-MM-DD  — dia consultado (padrão hoje; futuro é travado em hoje)
//   ?usuario=Nome    — recorte por pessoa; vazio = empresa toda
//   ?equipe=id       — recorte por equipe (item 117), só admin
//
// Quem não é admin só vê o próprio recorte: sem `usuario` a resposta já vem
// filtrada nele, e pedir outra pessoa é recusado.
export async function GET(req) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const dia = sp.get("dia");
  const pedido = sp.get("usuario");
  const equipeId = sp.get("equipe");

  let usuario = null;
  let equipeMeta = null;
  let equipeNome = null;
  if (isAdmin(user)) {
    if (equipeId) {
      const equipe = await prisma.equipe.findUnique({ where: { id: equipeId }, include: { membros: { select: { name: true } } } });
      if (!equipe) return NextResponse.json({ error: "Equipe não encontrada." }, { status: 404 });
      usuario = equipe.membros.map((m) => m.name);
      equipeMeta = equipe;
      equipeNome = equipe.nome;
    } else {
      usuario = pedido || null; // admin escolhe: null = total da empresa
    }
  } else {
    if (pedido && pedido !== user.name) {
      return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    }
    usuario = user.name;
  }

  const resumo = await resumoMetas(dia, usuario, equipeMeta);
  return NextResponse.json({ ...resumo, podeVerTotal: isAdmin(user), equipeNome });
}
