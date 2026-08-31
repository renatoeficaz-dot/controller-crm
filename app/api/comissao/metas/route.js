import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { lerCorpo } from "@/lib/corpo";
import { METRICAS_COMISSAO } from "@/lib/comissao";

// Metas de comissão por colaborador+métrica (Análise, Recebimento,
// Recuperação, Juros, Cravo) — só admin gerencia.
export async function GET(req) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const userId = new URL(req.url).searchParams.get("userId");
  const metas = await prisma.comissaoMetaColaborador.findMany({
    where: userId ? { userId } : undefined,
  });
  return NextResponse.json(metas);
}

// Upsert de uma meta (userId + metrica). Enviar zeros em tudo equivale a
// desligar essa métrica pra esse colaborador (volta a cair no fallback global,
// que só existe pra "recuperacao" — as outras métricas ficam sem meta mesmo).
export async function POST(req) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const body = await lerCorpo(req);
  const { userId, metrica } = body;
  if (!userId || !METRICAS_COMISSAO.includes(metrica)) {
    return NextResponse.json({ error: "userId ou métrica inválidos." }, { status: 400 });
  }
  const num = (v) => (v === "" || v == null ? 0 : Number(v) || 0);
  const data = {
    metaDiaria: num(body.metaDiaria),
    bonusDiario: num(body.bonusDiario),
    metaSemanal: num(body.metaSemanal),
    bonusSemanal: num(body.bonusSemanal),
  };

  const meta = await prisma.comissaoMetaColaborador.upsert({
    where: { userId_metrica: { userId, metrica } },
    update: data,
    create: { userId, metrica, ...data },
  });
  return NextResponse.json(meta);
}
