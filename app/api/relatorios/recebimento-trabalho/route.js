import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/session";

// Recebimento x horas trabalhadas no sistema, de um colaborador (ou de todos).
//   Recebido = pagamentos de parcelas (lançamentos de entrada com parcelaId), pela hora em que entraram — mesma regra das Metas.
//              É o recebido da operação inteira: a baixa é da IA ou de quem estiver no turno, não dá pra separar por pessoa.
//   Horas    = tempo ativo no sistema (heartbeat de 30 s com mouse/teclado e a aba na frente): UsoDiario por dia, UsoHora por hora.
// ?ini=AAAA-MM-DD&fim=AAAA-MM-DD&usuario=<nome> (sem usuario = soma de todos)
const diaValido = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "");
const r2 = (n) => Math.round(n * 100) / 100;
const diaBRT = (d) => new Date(new Date(d).getTime() - 3 * 3600e3).toISOString().slice(0, 10);
const horaBRT = (d) => new Date(new Date(d).getTime() - 3 * 3600e3).getUTCHours();

export async function GET(req) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const ini = searchParams.get("ini");
  const fim = searchParams.get("fim");
  const usuario = (searchParams.get("usuario") || "").trim();
  if (!diaValido(ini) || !diaValido(fim) || fim < ini) return NextResponse.json({ error: "Período inválido." }, { status: 400 });
  const de = new Date(`${ini}T00:00:00-03:00`);
  const ate = new Date(new Date(`${fim}T00:00:00-03:00`).getTime() + 86400e3);
  const deDia = new Date(`${ini}T00:00:00.000Z`), ateDia = new Date(`${fim}T00:00:00.000Z`);
  const filtroUsuario = usuario ? { usuario } : {};

  const [ls, usoDias, usoHoras, nomes] = await Promise.all([
    prisma.lancamento.findMany({ where: { type: "entrada", parcelaId: { not: null }, createdAt: { gte: de, lt: ate }, amount: { gt: 0 } }, select: { amount: true, createdAt: true } }),
    prisma.usoDiario.findMany({ where: { dia: { gte: deDia, lte: ateDia }, ...filtroUsuario }, select: { dia: true, segundos: true } }),
    prisma.usoHora.findMany({ where: { dia: { gte: deDia, lte: ateDia }, ...filtroUsuario }, select: { hora: true, segundos: true } }),
    prisma.usoDiario.findMany({ where: { dia: { gte: new Date(Date.now() - 90 * 86400e3) } }, distinct: ["usuario"], select: { usuario: true } }),
  ]);

  const dias = [];
  for (let t = deDia.getTime(); t <= ateDia.getTime(); t += 86400e3) dias.push({ dia: new Date(t).toISOString().slice(0, 10), recebido: 0, segundos: 0 });
  const porDia = new Map(dias.map((d) => [d.dia, d]));
  const horas = Array.from({ length: 24 }, (_, h) => ({ hora: h, recebido: 0, segundos: 0 }));
  for (const l of ls) {
    const d = porDia.get(diaBRT(l.createdAt));
    if (d) d.recebido += l.amount;
    horas[horaBRT(l.createdAt)].recebido += l.amount;
  }
  for (const u of usoDias) { const d = porDia.get(u.dia.toISOString().slice(0, 10)); if (d) d.segundos += u.segundos; }
  for (const u of usoHoras) if (horas[u.hora]) horas[u.hora].segundos += u.segundos;
  for (const x of [...dias, ...horas]) x.recebido = r2(x.recebido);

  const recebido = r2(dias.reduce((s, d) => s + d.recebido, 0));
  const segundos = dias.reduce((s, d) => s + d.segundos, 0);
  return NextResponse.json({
    usuarios: nomes.map((n) => n.usuario).filter((n) => !n.startsWith("Claude ")).sort((a, b) => a.localeCompare(b, "pt-BR")),
    dias,
    horas,
    // Por hora só existe desde 12/11/2026 (antes o sistema guardava só o total do dia).
    horasDesde: "2026-11-12",
    total: { recebido, segundos, porHora: segundos > 0 ? r2(recebido / (segundos / 3600)) : null },
  });
}
