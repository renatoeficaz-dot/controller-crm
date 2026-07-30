import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { resumoMetas } from "@/lib/metasResumo";

// Resumo da tela de Metas.
//   ?dia=YYYY-MM-DD  — dia consultado (padrão hoje; futuro é travado em hoje)
//   ?usuario=Nome    — recorte por pessoa; vazio = empresa toda
//
// Quem não é admin só vê o próprio recorte: sem `usuario` a resposta já vem
// filtrada nele, e pedir outra pessoa é recusado.
export async function GET(req) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const dia = sp.get("dia");
  const pedido = sp.get("usuario");

  let usuario = null;
  if (isAdmin(user)) {
    usuario = pedido || null; // admin escolhe: null = total da empresa
  } else {
    if (pedido && pedido !== user.name) {
      return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    }
    usuario = user.name;
  }

  const resumo = await resumoMetas(dia, usuario);
  return NextResponse.json({ ...resumo, podeVerTotal: isAdmin(user) });
}
