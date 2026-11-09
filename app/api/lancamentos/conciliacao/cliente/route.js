import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { palavrasDaBusca, rankearClientes } from "@/lib/buscaCliente";
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
  const tokens = palavrasDaBusca(sp.get("q") || "");
  if (!tokens.length || tokens.join("").length < 3) return NextResponse.json([]);
  // Nome/telefone de todos os clientes + mensagens dos últimos 120 dias: a comparação é feita sem acento e sem maiúscula (o SQLite não faz isso sozinho).
  const desde = new Date(Date.now() - 120 * 86400e3);
  const [contatos, mensagens] = await Promise.all([
    prisma.contact.findMany({ where: { excluidoEm: null }, select: { id: true, name: true, phone: true, stage: { select: { name: true } } } }),
    prisma.message.findMany({ where: { apagada: false, createdAt: { gte: desde }, NOT: { body: "" } }, select: { contactId: true, body: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 60000 }),
  ]);
  return NextResponse.json(rankearClientes(tokens, contatos.map((c) => ({ id: c.id, name: c.name, phone: c.phone, etapa: c.stage?.name || "" })), mensagens));
}
