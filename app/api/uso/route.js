import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/session";

const diaUTC = (d) => new Date(new Date(d).toLocaleDateString("en-CA") + "T00:00:00.000Z");

// Tempo de uso do sistema por colaborador — hoje e o período pedido (padrão:
// últimos 7 dias). ?de=YYYY-MM-DD&ate=YYYY-MM-DD filtra por um período
// específico (item pedido pelo Renato pra consultar uso em datas passadas).
export async function GET(req) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const hoje = diaUTC(new Date());
  const deParam = searchParams.get("de");
  const ateParam = searchParams.get("ate");

  const de = deParam ? diaUTC(deParam) : new Date(hoje.getTime() - 6 * 86400000);
  const ate = ateParam ? diaUTC(ateParam) : hoje;

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
