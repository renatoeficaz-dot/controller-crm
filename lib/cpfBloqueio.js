import { prisma } from "@/lib/prisma";

// Verifica se um CPF já deu calote (ficou marcado deuCalote=true) em OUTRO
// cadastro — pra avisar/bloquear antes de liberar capital de novo pra ele
// sob um telefone diferente. Retorna o contato encontrado, ou null.
export async function contatoComCaloteMesmoCpf(cpf, contactIdAtual) {
  // String() porque o CPF chega do corpo da requisição e pode vir como número
  // ou objeto — `(cpf || "")` só cobre vazio, e aí o .replace derruba a rota.
  const limpo = String(cpf ?? "").replace(/\D/g, "");
  if (!limpo) return null;
  // O "NOT id" só entra quando existe um lead atual pra excluir da busca. Na
  // consulta manual de CPF (/api/cpf-check) não existe lead ainda e vinha
  // null: o Prisma recusa `NOT: { id: null }` num campo obrigatório
  // ("Argument `id` must not be null"), a rota estourava e a tela só dizia
  // "Erro ao consultar" — a consulta manual nunca funcionou.
  const where = { deuCalote: true, cpf: { not: null } };
  if (contactIdAtual) where.NOT = { id: contactIdAtual };
  const contatos = await prisma.contact.findMany({
    where,
    select: { id: true, name: true, phone: true, cpf: true },
  });
  return contatos.find((c) => String(c.cpf ?? "").replace(/\D/g, "") === limpo) || null;
}
