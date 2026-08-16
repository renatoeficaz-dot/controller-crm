import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser, kanbansVisiveis, veTodosLeads } from "@/lib/session";

// Lista as colunas do Kanban com seus contatos, respeitando as permissões do usuário:
// - colunas: só as que ele pode ver (admin/sem restrição = todas)
// - leads: só os dele (responsável) quando não tem permissão de ver todos
export async function GET() {
  const user = await getCurrentUser();
  let colunas = kanbansVisiveis(user); // null = todas

  // Cobrador precisa sempre enxergar "Recebimento" pra poder dar baixa nas
  // parcelas, mesmo que a configuração de colunas visíveis dele não inclua —
  // é o trabalho dele, não deveria depender de configuração manual.
  if (user?.role === "cobrador" && colunas) {
    const recebimento = await prisma.stage.findFirst({ where: { name: "Recebimento" } });
    if (recebimento && !colunas.includes(recebimento.id)) colunas = [...colunas, recebimento.id];
  }

  const contactWhere = {
    excluidoEm: null, // exclusão fica reversível por 24h — não some da lista de vez
    ...(veTodosLeads(user) ? {} : { responsavel: user?.name || "__none__" }),
  };

  const config = await prisma.config.findUnique({
    where: { id: "singleton" },
    select: { slaPrimeiraRespostaMin: true, avisoAcumuloLimite: true },
  });

  const stages = await prisma.stage.findMany({
    where: colunas ? { id: { in: colunas } } : {},
    orderBy: { order: "asc" },
    include: {
      contacts: {
        where: contactWhere,
        // Fixado (item 54) sempre no topo da coluna, dentro disso mantém a
        // ordem manual de sempre.
        orderBy: [{ fixado: "desc" }, { order: "asc" }],
        include: {
          parcelas: { orderBy: { number: "asc" } },
          tags: { select: { id: true, name: true, color: true } },
          campanha: { select: { id: true, nome: true, regiao: true } },
          _count: { select: { messages: { where: { fromMe: false, readAt: null } }, tasks: true } },
          tasks: { where: { done: false }, select: { dueDate: true } },
          // take: 50 (e não 1) porque além do horário da última mensagem o
          // relatório precisa saber se o lead JÁ respondeu alguma vez — só o
          // fromMe da última mensagem não diz isso.
          messages: {
            orderBy: { createdAt: "desc" },
            take: 50,
            select: { createdAt: true, fromMe: true },
          },
        },
      },
    },
  });

  // Enriquece com unreadCount, tasksCount (pra alertar lead em Recebimento sem
  // nenhuma tarefa de cobrança), tarefasPendentes (datas das tarefas em aberto,
  // pro filtro de atrasada/hoje/a vencer no front) e o horário da última
  // mensagem (de qualquer direção) — o front ordena os cards por isso (mais
  // recente ou mais antiga primeiro, conforme o filtro escolhido).
  const agora = Date.now();
  const slaMs = config?.slaPrimeiraRespostaMin ? config.slaPrimeiraRespostaMin * 60 * 1000 : null;

  const enriched = stages.map((s) => ({
    ...s,
    // Aviso de acúmulo (item 58): coluna passou do limite configurado.
    acumulada: !!config?.avisoAcumuloLimite && s.contacts.length > config.avisoAcumuloLimite,
    contacts: s.contacts.map((c) => ({
      ...c,
      unreadCount: c._count?.messages || 0,
      tasksCount: c._count?.tasks || 0,
      tarefasPendentes: c.tasks || [],
      lastMessageAt: c.messages?.[0]?.createdAt || c.createdAt,
      // Quantas mensagens o CLIENTE mandou (limitado às últimas 50 da conversa).
      // Não adianta um booleano "respondeu": todo lead nasce de uma mensagem
      // recebida, então isso seria sempre true — o que separa lead real de
      // lead fantasma é ter mandado mais de uma.
      msgsCliente: (c.messages || []).filter((m) => !m.fromMe).length,
      // SLA de resposta: a última mensagem da conversa é do CLIENTE e já passou
      // do prazo configurado desde que ela chegou.
      //
      // Antes era "nenhuma mensagem nossa desde que o lead chegou", medido do
      // createdAt — o que só pegava lead novo nunca respondido. Depois da
      // primeira resposta o alerta desligava PRA SEMPRE, então cliente que
      // voltava a perguntar no meio da conversa e ficava sem resposta não
      // aparecia em lugar nenhum (havia conversa parada há mais de 30 dias
      // assim, sem nenhum aviso na tela).
      semRespostaSLA:
        !!slaMs &&
        !!c.messages?.[0] &&
        !c.messages[0].fromMe &&
        agora - new Date(c.messages[0].createdAt).getTime() > slaMs,
      messages: undefined,
      tasks: undefined,
      _count: undefined,
    })),
  }));
  return NextResponse.json(enriched);
}

// Cria uma nova coluna
export async function POST(req) {
  const body = await req.json().catch(() => ({})) ?? {};
  const last = await prisma.stage.findFirst({ orderBy: { order: "desc" } });
  const stage = await prisma.stage.create({
    data: {
      name: body.name || "Nova coluna",
      color: body.color || "#64748b",
      order: (last?.order ?? -1) + 1,
    },
  });
  return NextResponse.json(stage);
}
