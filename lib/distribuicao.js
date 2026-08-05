import { prisma } from "@/lib/prisma";

// Escolhe, entre os nomes do pool, quem tem MENOS leads ativos agora — não é
// um rodízio cego, é "por carga": quem está mais livre pega o próximo.
// "Ativo" exclui as colunas de fim de linha (perdido/cravo/pago), senão
// carteira antiga de quem trabalha bem pesaria contra ela.
export async function escolherPorCarga(pool) {
  const nomes = (pool || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!nomes.length) return null;
  if (nomes.length === 1) return nomes[0];

  const foraDaConta = ["Cravo", "Venda perdida", "Pago"];
  const contagens = await Promise.all(
    nomes.map((nome) =>
      prisma.contact.count({
        // excluidoEm: null — lead na lixeira pesava como carga e fazia a
        // pessoa parar de receber lead novo sem motivo.
        where: { responsavel: nome, excluidoEm: null, stage: { name: { notIn: foraDaConta } } },
      })
    )
  );

  let melhor = nomes[0];
  let menor = contagens[0];
  for (let i = 1; i < nomes.length; i++) {
    if (contagens[i] < menor) { melhor = nomes[i]; menor = contagens[i]; }
  }
  return melhor;
}
