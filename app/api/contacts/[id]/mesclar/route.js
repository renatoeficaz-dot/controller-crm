import { NextResponse } from "next/server";
import { mesclarContatos } from "@/lib/duplicados";
import { getCurrentUser } from "@/lib/session";
import { podeExecutar } from "@/lib/permissoes";
import { negarSeNaoPodeVerContato } from "@/lib/contatoAcesso";

export async function POST(req, { params }) {
  const { id } = await params;
  const negado = await negarSeNaoPodeVerContato(id);
  if (negado) return negado;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!podeExecutar(user, "mesclar_contatos")) {
    return NextResponse.json({ error: "Sem permissão para mesclar cadastros." }, { status: 403 });
  }

  const { comId } = await req.json().catch(() => ({})) ?? {};
  if (!comId) return NextResponse.json({ error: "Informe o cadastro a mesclar." }, { status: 400 });

  try {
    const contato = await mesclarContatos(id, comId, user.name);
    return NextResponse.json(contato);
  } catch (e) {
    return NextResponse.json({ error: e.message || "Erro ao mesclar." }, { status: 400 });
  }
}
