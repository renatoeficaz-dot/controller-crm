import { prisma } from "@/lib/prisma";

const VINTE_QUATRO_HORAS = 24 * 60 * 60 * 1000;

// Apaga de vez os leads excluídos há mais de 24h — depois desse prazo o
// "desfazer" da exclusão deixa de existir.
export async function purgarExcluidos() {
  const limite = new Date(Date.now() - VINTE_QUATRO_HORAS);
  const { count } = await prisma.contact.deleteMany({ where: { excluidoEm: { lt: limite } } });
  return count;
}
