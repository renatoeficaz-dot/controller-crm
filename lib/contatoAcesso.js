import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, veTodosLeads } from "@/lib/session";

// A lista do funil já filtrava lead por responsável quando o usuário não tem
// "vê todos os leads" — mas as rotas de DETALHE não filtravam nada. Bastava
// saber o id (ou trocar o id na URL) pra ler a ficha inteira de qualquer
// cliente: telefone, CPF, valor emprestado, parcelas e a conversa completa do
// WhatsApp. E o PATCH também passava, então dava pra EDITAR lead dos outros.
//
// Uso nas rotas:
//   const negado = await negarSeNaoPodeVerContato(id);
//   if (negado) return negado;
export async function podeVerContato(user, contactId) {
  if (!user) return false;
  if (veTodosLeads(user)) return true;
  const c = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { responsavel: true },
  });
  if (!c) return true; // deixa a própria rota devolver o 404 dela
  return c.responsavel === user.name;
}

export async function negarSeNaoPodeVerContato(contactId) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (await podeVerContato(user, contactId)) return null;
  return NextResponse.json({ error: "Esse lead não é seu." }, { status: 403 });
}
