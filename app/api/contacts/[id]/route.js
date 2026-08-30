import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser, getSession, mensagensWhere } from "@/lib/session";
import { registrarAuditoria } from "@/lib/auditoria";
import { contatoComCaloteMesmoCpf } from "@/lib/cpfBloqueio";
import { valorEmAberto } from "@/lib/finance";
import { negarSeNaoPodeVerContato } from "@/lib/contatoAcesso";
import { lerCorpo, texto, ehNaoEncontrado, respostaNaoEncontrado } from "@/lib/corpo";
import { markMessagesAsRead } from "@/lib/evolution";

// Busca um contato com suas mensagens (conforme permissão de WhatsApp) e parcelas.
// mediaUrl (base64) fica de fora — mídia é carregada sob demanda via /api/messages/[id]/media.
export async function GET(_req, { params }) {
  const { id } = await params;
  const negado = await negarSeNaoPodeVerContato(id);
  if (negado) return negado;
  const user = await getCurrentUser();
  const contact = await prisma.contact.findUnique({
    where: { id },
    include: {
      messages: {
        where: mensagensWhere(user),
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          contactId: true,
          body: true,
          kind: true,
          mimeType: true,
          fileName: true,
          fromMe: true,
          status: true,
          instance: true,
          readAt: true,
          apagada: true,
          createdAt: true,
        },
      },
      stage: true,
      parcelas: { orderBy: [{ ciclo: "asc" }, { number: "asc" }] },
      tags: { select: { id: true, name: true, color: true } },
      referencias: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!contact) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  // Marca as mensagens recebidas como lidas ao abrir o contato — e, junto,
  // manda a confirmação de leitura de verdade pro WhatsApp do cliente (double
  // -check azul), não só no nosso banco.
  const naoLidas = await prisma.message.findMany({
    where: { contactId: id, fromMe: false, readAt: null },
    select: { waMessageId: true, instance: true },
  });
  await prisma.message.updateMany({
    where: { contactId: id, fromMe: false, readAt: null },
    data: { readAt: new Date() },
  });
  if (naoLidas.length && contact.phone) {
    const porInstancia = new Map();
    for (const m of naoLidas) {
      if (!m.waMessageId) continue;
      const chave = m.instance || "";
      if (!porInstancia.has(chave)) porInstancia.set(chave, []);
      porInstancia.get(chave).push(m.waMessageId);
    }
    for (const [instance, ids] of porInstancia) {
      markMessagesAsRead(contact.phone, ids, instance || undefined).catch(() => {});
    }
  }
  return NextResponse.json(contact);
}

// Atualiza dados do contato
export async function PATCH(req, { params }) {
  try {
    const { id } = await params;
    const negado = await negarSeNaoPodeVerContato(id);
    if (negado) return negado;
    const body = await lerCorpo(req);
    const data = {};
    for (const f of [
      "name", "phone", "notes", "responsavel", "estado", "genero", "tipoCliente", "cpf", "endereco",
      "pixChave", "pixNomeCompleto", "horarioRecebimento",
    ]) {
      // Todos estes são texto no banco. Repassar o valor cru deixava o Prisma
      // recusar (e a rota estourar 500) quando vinha número/objeto/array —
      // basta um cliente mandar {"phone": 456}. Normaliza pra texto; vazio
      // vira null, que é como o campo "em branco" é guardado.
      if (f in body) data[f] = texto(body[f]) || null;
    }
    if ("chatFixado" in body) data.chatFixado = !!body.chatFixado;
    if ("chatArquivado" in body) data.chatArquivado = !!body.chatArquivado;
    if ("naoPerturbarAte" in body) data.naoPerturbarAte = body.naoPerturbarAte ? new Date(body.naoPerturbarAte) : null;
    if ("valorCapital" in body) {
      data.valorCapital = body.valorCapital === "" || body.valorCapital == null ? null : Number(body.valorCapital);
    }
    if ("pagamentoCapital" in body) {
      data.pagamentoCapital = body.pagamentoCapital ? new Date(body.pagamentoCapital) : null;
    }
    if ("iaPausada" in body) data.iaPausada = !!body.iaPausada;
    if ("checklistTelefoneBate" in body) data.checklistTelefoneBate = !!body.checklistTelefoneBate;
    if ("checklistDivergenciaPrint" in body) data.checklistDivergenciaPrint = !!body.checklistDivergenciaPrint;
    if ("checklistAntecedentes" in body) data.checklistAntecedentes = !!body.checklistAntecedentes;
    if ("camposCustom" in body) data.camposCustom = body.camposCustom ? JSON.stringify(body.camposCustom) : null;
    if ("fixado" in body) data.fixado = !!body.fixado;
    if ("corCard" in body) data.corCard = body.corCard || null;
  
    // Nenhum teto de tamanho aqui: uma sessão comprometida (ou um bug de front
    // que manda o campo errado) conseguia gravar texto de qualquer tamanho em
    // "notes"/"camposCustom" — mesmo risco de inflar o banco que já corrigimos
    // no formulário público, só que pelo lado autenticado.
    if (data.notes && data.notes.length > 20000) {
      return NextResponse.json({ error: "Observação muito longa." }, { status: 400 });
    }
    if (data.name && data.name.length > 500) {
      return NextResponse.json({ error: "Nome muito longo." }, { status: 400 });
    }
    if (data.camposCustom && data.camposCustom.length > 50000) {
      return NextResponse.json({ error: "Campos personalizados excedem o tamanho permitido." }, { status: 400 });
    }
    // Mesmo teto dos campos acima — endereço/Pix são preenchidos tanto pelo
    // usuário quanto pela IA (lendo documento), então herdam o mesmo risco.
    if (data.endereco && data.endereco.length > 2000) {
      return NextResponse.json({ error: "Endereço muito longo." }, { status: 400 });
    }
    if (data.pixChave && data.pixChave.length > 500) {
      return NextResponse.json({ error: "Chave Pix muito longa." }, { status: 400 });
    }
    if (data.pixNomeCompleto && data.pixNomeCompleto.length > 500) {
      return NextResponse.json({ error: "Nome muito longo." }, { status: 400 });
    }
  
    // Item 191: guarda quem era o responsável antes de trocar — sem isso a
    // troca fica muda, ninguém consegue ver depois quem cuidava do lead antes.
    let responsavelAntes = null;
    if ("responsavel" in body) {
      responsavelAntes = await prisma.contact.findUnique({ where: { id }, select: { responsavel: true } });
    }

    // Feed de atividade do lead (chat → "Atividade"): guarda o valor de ANTES
    // dos campos relevantes pra montar o diff depois do update. Só os campos
    // que valem a pena mostrar no feed — notes/camposCustom ficam de fora
    // (podem ser gigantes e não é raro editar).
    const CAMPOS_AUDITAVEIS = [
      "name", "phone", "estado", "genero", "tipoCliente", "cpf", "endereco",
      "pixChave", "pixNomeCompleto", "horarioRecebimento", "valorCapital", "iaPausada",
    ];
    const camposMudando = CAMPOS_AUDITAVEIS.filter((f) => f in data);
    const antesAuditoria = camposMudando.length
      ? await prisma.contact.findUnique({ where: { id }, select: Object.fromEntries(camposMudando.map((f) => [f, true])) })
      : null;

    const contact = await prisma.contact.update({ where: { id }, data });

    if (antesAuditoria) {
      const session = await getSession().catch(() => null);
      const mudou = camposMudando.filter((f) => String(antesAuditoria[f] ?? "") !== String(contact[f] ?? ""));
      if (mudou.length) {
        const detalhe = mudou
          .map((f) => `${f}: "${antesAuditoria[f] ?? "—"}" → "${contact[f] ?? "—"}"`)
          .join("; ");
        registrarAuditoria({
          usuario: session?.name,
          acao: "editar_campo",
          entidade: "Contact",
          entidadeId: id,
          detalhe,
        });
      }
    }
  
    if ("responsavel" in body && responsavelAntes && responsavelAntes.responsavel !== contact.responsavel) {
      const session = await getSession().catch(() => null);
      await prisma.responsavelLog.create({
        data: { contactId: id, de: responsavelAntes.responsavel, para: contact.responsavel, usuario: session?.name || null },
      }).catch(() => {});
    }
  
    // Não bloqueia salvar o CPF em si (só bloqueia avançar no funil, no
    // /move) — mas já avisa na hora se bate com outro cadastro que deu calote.
    let caloteAviso = null;
    if ("cpf" in body && contact.cpf) {
      caloteAviso = await contatoComCaloteMesmoCpf(contact.cpf, id);
    }
  
    return NextResponse.json({ ...contact, caloteAviso });
  } catch (err) {
    // Registro do `where` não existe (link velho, dois cliques, id
    // chutado): é "não achei", não erro de servidor.
    if (ehNaoEncontrado(err)) return respostaNaoEncontrado();
    throw err;
  }
}

// Remove o contato
// Exclusão reversível: só marca excluidoEm e some das listas — não apaga de
// verdade. Dá pra desfazer em até 24h (POST .../restaurar); depois disso um
// job diário (lib/purgaExcluidos.js) apaga definitivamente. Sem isso, um
// "excluir" errado por engano é irreversível na hora.
export async function DELETE(req, { params }) {
  try {
    const { id } = await params;
    const negado = await negarSeNaoPodeVerContato(id);
    if (negado) return negado;
    const force = new URL(req.url).searchParams.get("force") === "1";
    const [session, contact] = await Promise.all([
      getSession(),
      prisma.contact.findUnique({ where: { id }, select: { name: true } }),
    ]);
  
    // Item 153: excluir um lead que ainda deve esconde a dívida (mesmo sendo
    // reversível em 24h). Sem `force=1`, avisa quanto tem em aberto antes.
    if (!force) {
      // renegociada: false — quem fechou acordo e pagou tudo não deve mais
      // nada, mas as parcelas antigas seguem com paid=false e travavam a
      // exclusão pra sempre, cobrando uma dívida que já foi quitada.
      const abertas = await prisma.parcela.findMany({ where: { contactId: id, paid: false, renegociada: false }, select: { amount: true } });
      if (abertas.length > 0) {
        const total = abertas.reduce((s, p) => s + valorEmAberto(p), 0);
        return NextResponse.json(
          { error: `Este lead tem ${abertas.length} parcela(s) em aberto, somando R$ ${total.toFixed(2)}.`, temParcelasAbertas: true, qtdParcelasAbertas: abertas.length, valorAberto: total },
          { status: 409 }
        );
      }
    }
  
    await prisma.contact.update({ where: { id }, data: { excluidoEm: new Date() } });
    registrarAuditoria({
      usuario: session?.name,
      acao: "excluir_contato",
      entidade: "Contact",
      entidadeId: id,
      detalhe: contact?.name,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Registro do `where` não existe (link velho, dois cliques, id
    // chutado): é "não achei", não erro de servidor.
    if (ehNaoEncontrado(err)) return respostaNaoEncontrado();
    throw err;
  }
}
