import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/session";

const diaUTC = (d) => new Date(new Date(d).toLocaleDateString("en-CA") + "T00:00:00.000Z");

// Tempo de uso do sistema por colaborador — hoje e média dos últimos 7 dias.
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const hoje = diaUTC(new Date());
  const seteDiasAtras = new Date(hoje.getTime() - 6 * 86400000);

  const registros = await prisma.usoDiario.findMany({ where: { dia: { gte: seteDiasAtras } } });

  const porUsuario = new Map();
  for (const r of registros) {
    if (!porUsuario.has(r.usuario)) porUsuario.set(r.usuario, { usuario: r.usuario, hojeSegundos: 0, semanaSegundos: 0, diasComUso: 0 });
    const acc = porUsuario.get(r.usuario);
    acc.semanaSegundos += r.segundos;
    acc.diasComUso += 1;
    if (r.dia.getTime() === hoje.getTime()) acc.hojeSegundos = r.segundos;
  }

  return NextResponse.json(
    [...porUsuario.values()].sort((a, b) => b.hojeSegundos - a.hojeSegundos)
  );
}
