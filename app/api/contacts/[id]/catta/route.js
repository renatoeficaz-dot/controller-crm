import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { negarSeNaoPodeVerContato } from "@/lib/contatoAcesso";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { consultarDonosDoContato } from "@/lib/catta";

// Consulta (ou refaz) o dono dos telefones de referência do lead na Catta. Só admin: gasta crédito e mostra dado de terceiro.
export async function POST(req, { params }) {
  const { id } = await params;
  const negado = await negarSeNaoPodeVerContato(id);
  if (negado) return negado;
  const user = await getCurrentUser().catch(() => null);
  if (!isAdmin(user)) return NextResponse.json({ error: "Só admin pode consultar a Catta." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const r = await consultarDonosDoContato(id, { forcar: !!body.forcar });
  if (r.motivo === "desligado") return NextResponse.json({ error: "A integração com a Catta está desligada ou sem chave (Configurações → Tokens)." }, { status: 400 });
  const referencias = await prisma.contatoReferencia.findMany({ where: { contactId: id }, orderBy: { createdAt: "asc" } });
  return NextResponse.json({ feito: r.feito, referencias });
}
