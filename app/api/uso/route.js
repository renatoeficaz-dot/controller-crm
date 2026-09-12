import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/session";

// Converte um INSTANTE (Date "agora") na chave "dia" usada no banco: o dia
// civil em Brasília daquele instante, como UTC-midnight desse mesmo dia —
// mesma convenção do heartbeat. Só serve pra um Date de verdade (timestamp).
const diaUTCDeInstante = (d) => new Date(new Date(d).toLocaleDateString("en-CA") + "T00:00:00.000Z");

// Uma string "YYYY-MM-DD" vinda de query param (?de=2026-09-11) JÁ é o dia
// civil desejado — não é um instante pra reconverter de fuso. Rodar essa
// string por diaUTCDeInstante quebrava: new Date("2026-09-11") vira meia-
// noite UTC, que em Brasília (UTC-3) ainda é 21h do dia 10 — a re-conversão
// jogava a data escolhida um dia inteiro pra trás, fazendo "hoje" (calculado
// certo, via diaUTCDeInstante) nunca bater com o "de/ate" pedido (calculado
// errado), e a consulta silenciosamente buscava o dia ANTERIOR ao escolhido.
const diaUTCDeString = (s) => new Date(s + "T00:00:00.000Z");

// Tempo de uso do sistema por colaborador — hoje e o período pedido (padrão:
// últimos 7 dias). ?de=YYYY-MM-DD&ate=YYYY-MM-DD filtra por um período
// específico (item pedido pelo Renato pra consultar uso em datas passadas).
export async function GET(req) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const hoje = diaUTCDeInstante(new Date());
  const deParam = searchParams.get("de");
  const ateParam = searchParams.get("ate");

  const de = deParam ? diaUTCDeString(deParam) : new Date(hoje.getTime() - 6 * 86400000);
  const ate = ateParam ? diaUTCDeString(ateParam) : hoje;

  const registros = await prisma.usoDiario.findMany({ where: { dia: { gte: de, lte: ate } } });

  const porUsuario = new Map();
  for (const r of registros) {
    if (!porUsuario.has(r.usuario)) porUsuario.set(r.usuario, { usuario: r.usuario, hojeSegundos: 0, periodoSegundos: 0, diasComUso: 0 });
    const acc = porUsuario.get(r.usuario);
    acc.periodoSegundos += r.segundos;
    acc.diasComUso += 1;
    if (r.dia.getTime() === hoje.getTime()) acc.hojeSegundos = r.segundos;
  }

  return NextResponse.json(
    [...porUsuario.values()].sort((a, b) => b.periodoSegundos - a.periodoSegundos)
  );
}
