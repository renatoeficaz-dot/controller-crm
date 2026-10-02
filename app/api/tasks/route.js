import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { lerCorpo, texto } from "@/lib/corpo";

// Lista tarefas (com filtros opcionais) — usado na aba "Tarefas" e no card do lead.
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const contactId = searchParams.get("contactId");
  const done = searchParams.get("done"); // "true" | "false" | null (todas)
  const tipoId = searchParams.get("tipoId");

  const where = {};
  if (contactId) where.contactId = contactId;
  if (done === "true") where.done = true;
  if (done === "false") where.done = false;
  if (tipoId) where.tipoId = tipoId;

  // Tarefa sem responsavel próprio segue implícito o responsável do LEAD (ver
  // comentário no schema) — filtrar só por task.responsavel escondia a
  // maioria das tarefas de cada pessoa, que nunca tiveram isso preenchido.
  const responsavel = searchParams.get("responsavel");
  if (responsavel) {
    where.OR = [{ responsavel }, { responsavel: null, contact: { responsavel } }];
  }

  const tasks = await prisma.task.findMany({
    where,
    orderBy: { dueDate: "asc" },
    include: {
      contact: { select: { id: true, name: true, phone: true, responsavel: true } },
      tipo: { select: { id: true, name: true, color: true, emoji: true } },
    },
  });
  return NextResponse.json(tasks);
}

// Cria uma tarefa avulsa pra um lead (diferente das tarefas automáticas de cobrança,
// que nascem vinculadas a uma parcela).
export async function POST(req) {
  const body = await lerCorpo(req);
  // Título deixou de ser obrigatório (pedido: tela já sugere o tipo
  // escolhido como título antes de chegar aqui) — "Tarefa" é só a rede de
  // segurança pro caso de vir mesmo assim em branco (ex.: chamada direta à API).
  const title = texto(body.title) || "Tarefa";
  const contactId = body.contactId;
  if (!contactId) {
    return NextResponse.json({ error: "Informe o lead." }, { status: 400 });
  }
  // Repetição no período (ex.: das 13:00 às 17:00, a cada 60 min): cria uma
  // tarefa por horário, no mesmo dia, pro mesmo lead.
  const rep = body.repetir;
  if (rep && typeof body.dueDate === "string" && body.dueDate.length >= 10) {
    const passo = Math.floor(Number(rep.cadaMin));
    const dia = body.dueDate.slice(0, 10);
    const fim = new Date(`${dia}T${/^\d{2}:\d{2}$/.test(rep.ate || "") ? rep.ate : "00:00"}:00`);
    const inicio = new Date(body.dueDate);
    if (!(passo >= 5 && passo <= 720) || isNaN(fim) || isNaN(inicio) || fim < inicio) {
      return NextResponse.json({ error: "Período inválido: o horário final precisa ser depois do inicial e o intervalo de 5 min a 12 h." }, { status: 400 });
    }
    const horarios = [];
    for (let t = inicio.getTime(); t <= fim.getTime(); t += passo * 60000) horarios.push(new Date(t));
    if (horarios.length > 60) {
      return NextResponse.json({ error: `Isso criaria ${horarios.length} tarefas (máximo 60). Aumente o intervalo ou reduza o período.` }, { status: 400 });
    }
    const dados = horarios.map((dueDate) => ({
      contactId,
      title,
      notes: texto(body.notes) || null,
      dueDate,
      tipoId: body.tipoId || null,
      responsavel: body.responsavel || null,
    }));
    await prisma.task.createMany({ data: dados });
    return NextResponse.json({ ok: true, criadas: dados.length });
  }
  const task = await prisma.task.create({
    data: {
      contactId,
      title,
      notes: texto(body.notes) || null,
      dueDate: body.dueDate ? new Date(body.dueDate) : new Date(),
      tipoId: body.tipoId || null,
      responsavel: body.responsavel || null,
    },
    include: {
      contact: { select: { id: true, name: true, phone: true, responsavel: true } },
      tipo: { select: { id: true, name: true, color: true, emoji: true } },
    },
  });
  return NextResponse.json(task);
}
