import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser, veTodosLeads, mensagensWhere, instanciasVisiveis } from "@/lib/session";

// Lista conversas do usuário (contatos com mensagens, ordenados pela mais recente).
// Cada item traz o contato + última mensagem + contagem de não lidas + dados
// usados pelos filtros da tela de Chat (etapa, tags, parcelas, número de origem).
export async function GET(req) {
  const user = await getCurrentUser();
  const mostrarArquivadas = new URL(req.url).searchParams.get("arquivadas") === "1";
  const contactWhere = {
    excluidoEm: null,
    chatArquivado: mostrarArquivadas, // item 82: por padrão só as não-arquivadas
    ...(veTodosLeads(user) ? {} : { responsavel: user?.name || "__none__" }),
  };
  const msgWhere = mensagensWhere(user);

  const contacts = await prisma.contact.findMany({
    where: { ...contactWhere, messages: { some: msgWhere || {} } },
    select: {
      id: true,
      name: true,
      phone: true,
      responsavel: true,
      stageId: true,
      stage: { select: { id: true, name: true } },
      tags: { select: { id: true, name: true, color: true } },
      parcelas: { select: { dueDate: true, paid: true, ciclo: true } },
      cicloAtual: true,
      chatFixado: true,
      chatArquivado: true,
      _count: {
        select: { messages: { where: { fromMe: false, readAt: null, ...(msgWhere || {}) } } },
      },
    },
  });

  // Última mensagem de cada conversa numa consulta só. O `messages: { take: 1 }`
  // aninhado do Prisma lia TODAS as mensagens de cada contato e cortava na
  // memória (~800ms de 1,2s desta rota, rodando a cada poucos segundos por
  // usuário — e como o banco atende uma consulta por vez, abrir uma conversa
  // ficava na fila atrás dela).
  const inst = instanciasVisiveis(user);
  const filtroInst = inst
    ? Prisma.sql`WHERE (instance IS NULL OR instance IN (${Prisma.join(inst.length ? inst : [""])}))`
    : Prisma.empty;
  const ultimas = await prisma.$queryRaw`
    SELECT m.contactId, m.body, m.kind, m.fromMe, m.createdAt, m.instance
    FROM Message m
    JOIN (SELECT contactId, MAX(createdAt) mx FROM Message ${filtroInst} GROUP BY contactId) x
      ON x.contactId = m.contactId AND x.mx = m.createdAt
    ${inst ? Prisma.sql`WHERE (m.instance IS NULL OR m.instance IN (${Prisma.join(inst.length ? inst : [""])}))` : Prisma.empty}`;
  const ultimaPorContato = new Map();
  for (const m of ultimas) {
    if (!ultimaPorContato.has(m.contactId)) {
      ultimaPorContato.set(m.contactId, { body: m.body, kind: m.kind, fromMe: !!m.fromMe, createdAt: m.createdAt, instance: m.instance });
    }
  }

  const result = contacts
    .map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      responsavel: c.responsavel,
      stageId: c.stageId,
      stageName: c.stage?.name || null,
      tags: c.tags,
      parcelas: c.parcelas,
      cicloAtual: c.cicloAtual,
      chatFixado: c.chatFixado,
      chatArquivado: c.chatArquivado,
      instance: ultimaPorContato.get(c.id)?.instance || null,
      lastMessage: ultimaPorContato.get(c.id) || null,
      unreadCount: c._count?.messages || 0,
    }))
    .sort((a, b) => {
      // Fixada (item 81) sempre no topo, dentro disso ordena por mais recente.
      if (a.chatFixado !== b.chatFixado) return a.chatFixado ? -1 : 1;
      const da = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt) : 0;
      const db = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt) : 0;
      return db - da;
    });

  return NextResponse.json(result);
}
