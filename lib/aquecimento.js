import { prisma } from "@/lib/prisma";

// Número novo que dispara volume alto é banido pelo WhatsApp na hora. O teto
// cresce com os dias de uso, imitando o comportamento de um número real que
// vai ganhando conversas aos poucos.
const ESCADA = [
  { ateDia: 3, limite: 20 },
  { ateDia: 7, limite: 50 },
  { ateDia: 14, limite: 100 },
];

// Dias completos desde o início do aquecimento (dia 1 = o próprio dia em que ligou).
export function diasDeAquecimento(numero) {
  if (!numero?.aquecimentoDesde) return null;
  const inicio = new Date(String(numero.aquecimentoDesde).slice(0, 10));
  const hoje = new Date(new Date().toLocaleDateString("en-CA"));
  return Math.floor((hoje - inicio) / 86400000) + 1;
}

// Teto de envios automáticos do dia. null = sem limite (aquecimento desligado
// ou já concluído).
export function limiteDoDia(numero) {
  if (!numero?.aquecimentoAtivo) return null;
  const dia = diasDeAquecimento(numero);
  if (dia == null) return null;
  const faixa = ESCADA.find((f) => dia <= f.ateDia);
  return faixa ? faixa.limite : null;
}

// Quantas mensagens já saíram desse número hoje.
export async function enviadasHoje(instance) {
  if (!instance) return 0;
  const inicio = new Date(new Date().toLocaleDateString("en-CA") + "T00:00:00.000Z");
  return prisma.message.count({
    where: { fromMe: true, instance, createdAt: { gte: inicio } },
  });
}

// true quando o número já bateu o teto do dia e não deve receber mais envio
// automático. Envio manual pelo chat não passa por aqui de propósito — quem
// está conversando de verdade não é o risco.
export async function atingiuLimite(numero) {
  const limite = limiteDoDia(numero);
  if (limite == null) return false;
  return (await enviadasHoje(numero.instance)) >= limite;
}
