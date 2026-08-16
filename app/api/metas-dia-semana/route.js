import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { lerCorpo } from "@/lib/corpo";

// Metas específicas por dia da semana (0=domingo..6=sábado) — quando não há
// linha pra um dia, ele usa a meta global normalmente.
export async function GET() {
  const rows = await prisma.metaDiaSemana.findMany();
  return NextResponse.json(rows);
}

// Body: { diaSemana: 0-6, ...campos numéricos ou "" pra voltar a usar a meta global }
export async function PATCH(req) {
  const body = await lerCorpo(req);
  const diaSemana = Number(body.diaSemana);
  if (!Number.isInteger(diaSemana) || diaSemana < 0 || diaSemana > 6) {
    return NextResponse.json({ error: "diaSemana inválido (0-6)" }, { status: 400 });
  }
  const num = (v) => (v === "" || v == null ? null : Number(v) || null);
  const data = {
    metaVendasMinima: num(body.metaVendasMinima),
    metaVendasMedia: num(body.metaVendasMedia),
    metaVendasDia: num(body.metaVendasDia),
    metaPctRecebimentoMinima: num(body.metaPctRecebimentoMinima),
    metaPctRecebimentoMedia: num(body.metaPctRecebimentoMedia),
    metaPctRecebimento: num(body.metaPctRecebimento),
  };
  const row = await prisma.metaDiaSemana.upsert({
    where: { diaSemana },
    update: data,
    create: { diaSemana, ...data },
  });
  return NextResponse.json(row);
}
