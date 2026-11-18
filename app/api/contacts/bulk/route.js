import { podeExcluirContato } from "@/lib/permissoes";
import { registrarAuditoria } from "@/lib/auditoria";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { lerCorpo } from "@/lib/corpo";
import { getCurrentUser, isAdmin, veTodosLeads } from "@/lib/session";
import { PATCH as moverContato } from "@/app/api/contacts/[id]/move/route";

// Data local de hoje como UTC-midnight (evita drift de fuso nas parcelas)
function hojeUTC() {
  const hoje = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD local
  return new Date(hoje + "T00:00:00.000Z");
}

// Ações em massa sobre um conjunto de leads (os que estão no filtro do funil).
// body: { ids: string[], action: "stage" | "responsavel" | "delete", value?: string }
export async function POST(req) {
  let { ids, action, value, motivoPerda } = await lerCorpo(req);
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "Nenhuma lead selecionada." }, { status: 400 });
  }
  // Só ids em texto, sem repetidos; valor em texto (número/objeto derrubava o Prisma com 500).
  ids = [...new Set(ids.filter((x) => typeof x === "string" && x))];
  value = typeof value === "string" ? value.trim() : value == null ? null : String(value);

  const user = await getCurrentUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  // Quem não vê todos os leads não pode mandar aqui um id de lead ALHEIO — a
  // tela do funil já só mostra os dele, mas a API aceitava qualquer id que o
  // corpo da requisição mandasse. Restringe aos leads que o usuário realmente
  // pode ver, do mesmo jeito que a rota de detalhe individual já faz.
  if (!veTodosLeads(user)) {
    const meus = await prisma.contact.findMany({
      where: { id: { in: ids }, responsavel: user.name },
      select: { id: true },
    });
    ids = meus.map((c) => c.id);
    if (!ids.length) {
      return NextResponse.json({ error: "Nenhum desses leads é seu." }, { status: 403 });
    }
  }

  // Lead excluído (na lixeira de 24h) não entra em ação em massa.
  const where = { id: { in: ids }, excluidoEm: null };

  if (action === "responsavel") {
    // Responsável precisa ser alguém da equipe: nome digitado errado deixava os leads invisíveis para todo mundo que não é admin.
    if (value && !(await prisma.user.findFirst({ where: { name: value }, select: { id: true } }))) {
      return NextResponse.json({ error: "Responsável não encontrado na equipe." }, { status: 400 });
    }
    // Registra o histórico de responsável de cada lead (a troca individual já registrava; a em massa trocava sem rastro).
    const antes = await prisma.contact.findMany({ where: { ...where, NOT: { responsavel: value || null } }, select: { id: true, responsavel: true } });
    const r = await prisma.contact.updateMany({ where, data: { responsavel: value || null } });
    if (antes.length) {
      await prisma.responsavelLog.createMany({ data: antes.map((c) => ({ contactId: c.id, de: c.responsavel || null, para: value || null, usuario: user.name || null })) }).catch(() => {});
    }
    return NextResponse.json({ ok: true, updated: r.count });
  }

  if (action === "delete") {
    // Isto é deleteMany DEFINITIVO — não passa pelo excluidoEm (a exclusão com
    // 24h de desfazer). Sem trava, qualquer usuário logado (vendedor, cobrador)
    // apagava a carteira inteira mandando a lista de ids, sem volta.
    if (!podeExcluirContato(user)) {
      return NextResponse.json({ error: "Só o usuário gestor pode excluir clientes." }, { status: 403 });
    }
    // Exclusão reversível (como a individual) e com registro de quem excluiu — antes era apagar de vez, sem rastro.
    const alvo = await prisma.contact.findMany({ where: { ...where, excluidoEm: null }, select: { id: true, name: true } });
    const r = await prisma.contact.updateMany({ where: { id: { in: alvo.map((c) => c.id) } }, data: { excluidoEm: new Date() } });
    for (const c of alvo) registrarAuditoria({ usuario: user.name, acao: "excluir_contato", entidade: "Contact", entidadeId: c.id, detalhe: c.name + " (exclusão em massa)" });
    return NextResponse.json({ ok: true, deleted: r.count });
  }

  if (action === "stage") {
    if (!value) return NextResponse.json({ error: "Escolha a coluna de destino." }, { status: 400 });
    const stage = await prisma.stage.findUnique({ where: { id: value } });
    if (!stage) return NextResponse.json({ error: "Coluna não encontrada." }, { status: 404 });
    // Mover em massa passa pela MESMA regra do mover individual (bloqueio de CPF que deu calote, limite do capital escalonado, Pix e
    // capital obrigatórios, motivo da perda, tarefas de Análise/Vídeo chamada/Liberação, parcelas de quem foi perdido saindo da cobrança,
    // renovação de quem volta do Pago). Antes o em massa pulava tudo isso: dava para liberar um CPF bloqueado arrastando em lote.
    if (stage.name === "Venda perdida" && !motivoPerda) return NextResponse.json({ error: "Informe o motivo da perda." }, { status: 400 });
    const ativos = (await prisma.contact.findMany({ where: { ...where, NOT: { stageId: value } }, select: { id: true } })).map((c) => c.id);
    let moved = 0;
    const recusas = new Map();
    for (const cid of ativos) {
      const r = await moverContato(
        new Request(req.url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stageId: value, motivoPerda: motivoPerda || undefined, emMassa: true }) }),
        { params: Promise.resolve({ id: cid }) }
      );
      if (r.ok) { moved++; continue; }
      const d = await r.json().catch(() => ({}));
      const motivo = d.bloqueioCpf ? "CPF com calote em outro cadastro" : d.escalonamentoExcedido ? "capital acima do limite do ciclo" : d.error || "recusado";
      recusas.set(motivo, (recusas.get(motivo) || 0) + 1);
    }
    const skipped = ids.length - moved;
    return NextResponse.json({ ok: true, moved, skipped, motivos: Object.fromEntries(recusas) });
  }

  if (action === "stage_antigo") {
    const stage = await prisma.stage.findUnique({ where: { id: value } });
    if (!stage) return NextResponse.json({ error: "Coluna não encontrada." }, { status: 404 });

    // Regra: só vai para "Liberação pagamento" quem tem Valor do capital E
    // chave Pix preenchidos — mesma trava do move individual (sem Pix não dá
    // pra liberar o pagamento de verdade).
    let alvo = ids;
    let skipped = 0;
    if (stage.name === "Liberação pagamento") {
      const validos = await prisma.contact.findMany({
        where: { id: { in: ids }, valorCapital: { not: null }, pixChave: { not: null } },
        select: { id: true },
      });
      alvo = validos.map((v) => v.id);
      skipped = ids.length - alvo.length;
    }

    // "Recebimento" tem efeitos colaterais por contato (aviso fixo pro cliente
    // pelo número de Vendas, gerar parcelas, lançar a liberação de capital) —
    // não dá pra fazer com um updateMany só. Processa um a um, igual ao PATCH
    // de mover individual (senão o bulk pulava tudo isso, como já aconteceu:
    // lead ia pra Recebimento sem avisar o cliente).
    if (stage.name === "Recebimento") {
      const { regenerarParcelas, lancarLiberacaoCapital } = await import("@/lib/cobranca");
      const { sendRecebimentoNotice } = await import("@/lib/ia");
      const hoje = hojeUTC();
      let moved = 0;
      for (const id of alvo) {
        const contact = await prisma.contact.findUnique({ where: { id }, include: { parcelas: true, stage: { select: { name: true } } } });
        if (!contact || contact.stageId === value) continue;

        const last = await prisma.contact.findFirst({ where: { stageId: value }, orderBy: { order: "desc" } });
        // Só chega aqui quando a coluna muda de fato (o continue acima já
        // descartou quem já estava nela), então o cronômetro da etapa reseta.
        const data = { stageId: value, order: (last?.order ?? -1) + 1, entrouEtapaEm: new Date() };
        const aindaSemPlano = contact.parcelas.length === 0;
        if (contact.valorCapital && aindaSemPlano && !contact.pagamentoCapital) {
          data.pagamentoCapital = hoje;
        }
        if (!contact.entrouRecebimentoEm) data.entrouRecebimentoEm = new Date();

        const updated = await prisma.contact.update({ where: { id }, data });
        // Toda mudança de etapa precisa de registro: o histórico (EtapaLog) é o que diz em que etapa o cliente estava em cada dia — base da
        // meta de recebimento, da linha do tempo da ficha e da comissão por análise. O bulk mudava a etapa sem gravar nada.
        await prisma.etapaLog.create({ data: { contactId: id, deEtapa: contact.stage?.name || null, paraEtapa: stage.name, usuario: user.name || null } }).catch(() => {});
        if (updated.valorCapital && updated.pagamentoCapital && aindaSemPlano) {
          await regenerarParcelas(id);
        }
        await sendRecebimentoNotice(updated).catch(() => {});
        await lancarLiberacaoCapital(updated).catch(() => {});
        const { criarTarefaCobrancaRecebimento } = await import("@/lib/tarefaCobrancaRecebimento");
        await criarTarefaCobrancaRecebimento(id).catch(() => {});
        moved++;
      }
      return NextResponse.json({ ok: true, moved, skipped });
    }

    // Ao entrar em "Cravo" (perda/inadimplência), a IA para automaticamente.
    // Cravo também marca deuCalote (alimenta o bloqueio de CPF reincidente) —
    // aqui era o único caminho de mudança de etapa que ainda não fazia isso.
    const bulkData =
      stage.name === "Cravo"
        ? { stageId: value, iaPausada: true, deuCalote: true, entrouEtapaEm: new Date() }
        : { stageId: value, entrouEtapaEm: new Date() };
    // updateMany não deixa filtrar "só quem mudou de coluna", então exclui quem
    // já está na etapa — senão o cronômetro deles zeraria sem nada ter mudado.
    const mudam = await prisma.contact.findMany({ where: { id: { in: alvo }, NOT: { stageId: value } }, select: { id: true, stage: { select: { name: true } } } });
    const r = await prisma.contact.updateMany({
      where: { id: { in: alvo }, NOT: { stageId: value } },
      data: bulkData,
    });
    // Registro de cada mudança (ver o comentário do caminho de Recebimento acima).
    if (mudam.length) {
      await prisma.etapaLog.createMany({ data: mudam.map((c) => ({ contactId: c.id, deEtapa: c.stage?.name || null, paraEtapa: stage.name, usuario: user.name || null })) }).catch(() => {});
    }
    return NextResponse.json({ ok: true, moved: r.count, skipped });
  }

  return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
}
