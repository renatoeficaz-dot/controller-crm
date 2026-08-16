import { prisma } from "@/lib/prisma";

// Verifica se um CPF já deu calote (ficou marcado deuCalote=true) em OUTRO
// cadastro — pra avisar/bloquear antes de liberar capital de novo pra ele
// sob um telefone diferente. Retorna o contato encontrado, ou null.
export async function contatoComCaloteMesmoCpf(cpf, contactIdAtual) {
  // String() porque o CPF chega do corpo da requisição e pode vir como número
  // ou objeto — `(cpf || "")` só cobre vazio, e aí o .replace derruba a rota.
  const limpo = String(cpf ?? "").replace(/\D/g, "");
  if (!limpo) return null;
  const contatos = await prisma.contact.findMany({
    where: { deuCalote: true, cpf: { not: null }, NOT: { id: contactIdAtual } },
    select: { id: true, name: true, phone: true, cpf: true },
  });
  return contatos.find((c) => String(c.cpf ?? "").replace(/\D/g, "") === limpo) || null;
}
