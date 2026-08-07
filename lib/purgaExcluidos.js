import { prisma } from "@/lib/prisma";

const VINTE_QUATRO_HORAS = 24 * 60 * 60 * 1000;

// Apaga de vez os leads excluídos há mais de 24h — depois desse prazo o
// "desfazer" da exclusão deixa de existir.
export async function purgarExcluidos() {
  const limite = new Date(Date.now() - VINTE_QUATRO_HORAS);
  const { count } = await prisma.contact.deleteMany({ where: { excluidoEm: { lt: limite } } });
  return count;
}

// Registro de tentativa de login falha só serve pra contar as falhas recentes
// (janela de 15 min). Sem essa limpeza a tabela cresceria pra sempre — e é
// justamente a tabela que um ataque de força bruta faria inchar mais rápido.
export async function purgarTentativasLogin() {
  const limite = new Date(Date.now() - VINTE_QUATRO_HORAS);
  const { count } = await prisma.loginTentativa.deleteMany({ where: { createdAt: { lt: limite } } });
  return count;
}
