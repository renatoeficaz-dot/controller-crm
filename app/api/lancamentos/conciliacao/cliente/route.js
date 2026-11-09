import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { valorParcelaAtual, horaLimiteEfetiva } from "@/lib/finance";

// Apoio da conciliação: ?q=nome busca clientes; ?contactId=... lista as parcelas em aberto do ciclo atual (com o valor devido hoje, multa inclusa).
export async function GET(req) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const contactId = (sp.get("contactId") || "").trim();
  if (contactId) {
    const [cfg, c] = await Promise.all([
      prisma.config.findUnique({ where: { id: "singleton" } }),
      prisma.contact.findUnique({ where: { id: contactId }, select: { id: true, name: true, cicloAtual: true, tipoCliente: true, horarioRecebimento: true } }),
    ]);
    if (!c) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
    const ps = await prisma.parcela.findMany({ where: { contactId, ciclo: c.cicloAtual || 1, paid: false, renegociada: false }, orderBy: [{ dueDate: "asc" }, { number: "asc" }] });
    return NextResponse.json({
      cliente: { id: c.id, name: c.name },
      parcelas: ps.map((p) => ({
        id: p.id, number: p.number, dueDate: p.dueDate, amount: p.amount, valorPago: p.valorPago || 0,
        devido: Math.round(valorParcelaAtual(p, undefined, { multaPct: cfg?.multaPct, horaLimite: horaLimiteEfetiva(c, cfg) }) * 100) / 100,
      })),
    });
  }
  const q = (sp.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json([]);
  const lista = await prisma.contact.findMany({
    where: { excluidoEm: null, OR: [{ name: { contains: q } }, { phone: { contains: q.replace(/\D/g, "") || "\u0000" } }] },
    select: { id: true, name: true, phone: true, stage: { select: { name: true } } },
    orderBy: { name: "asc" },
    take: 8,
  });
  return NextResponse.json(lista.map((c) => ({ id: c.id, name: c.name, phone: c.phone, etapa: c.stage?.name || "" })));
}
