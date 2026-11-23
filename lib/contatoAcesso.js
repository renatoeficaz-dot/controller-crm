import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, veTodosLeads, kanbansVisiveis } from "@/lib/session";

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
    select: { responsavel: true, stageId: true, stage: { select: { name: true } } },
  });
  if (!c) return true; // deixa a própria rota devolver o 404 dela
  if (c.responsavel === user.name) return true;
  // Usuário não-admin com COLUNAS restritas enxerga qualquer lead que esteja
  // numa das etapas dele — ABRIR a ficha e a conversa inteira, não só os leads
  // em que ele é o responsável. É a MESMA regra do funil/chat (veTudoNasEtapas):
  // quem cuida de "Recebimento" precisa abrir o histórico de todo mundo que está
  // pra receber. Sem isto, a lista mostrava o card mas a ficha dava 403 e o
  // histórico vinha vazio.
  const colunas = kanbansVisiveis(user); // null = todas (admin já saiu lá em cima)
  if (Array.isArray(colunas) && colunas.length > 0) {
    if (c.stageId && colunas.includes(c.stageId)) return true;
    // Mesma regalia do funil: cobrador sempre enxerga Recebimento/Renovação,
    // mesmo que não estejam nas colunas configuradas dele.
    if (user.role === "cobrador" && ["Recebimento", "Renovação"].includes(c.stage?.name)) return true;
  }
  return false;
}

export async function negarSeNaoPodeVerContato(contactId) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (await podeVerContato(user, contactId)) return null;
  return NextResponse.json({ error: "Esse lead não é seu." }, { status: 403 });
}
