import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { lerCorpo, ehNaoEncontrado, respostaNaoEncontrado, texto } from "@/lib/corpo";

// Edita uma etapa (ex.: nome, cor, responsável automático)
// Etapas que o sistema procura pelo NOME (régua, metas, IA, comissão, relatórios...): renomear ou apagar quebrava tudo isso em silêncio.
const ETAPAS_DO_SISTEMA = ["Novo", "Em conversa", "Documentação", "Análise", "Vídeo chamada", "Liberação pagamento", "Recebimento", "Pago", "Cravo", "Venda perdida", "Aguardando Cobrador", "Renovação"];

export async function PATCH(req, { params }) {
  try {
    const { id } = await params;
    const body = await lerCorpo(req);
    const data = {};
    if ("name" in body) {
      const nome = texto(body.name);
      if (!nome) return NextResponse.json({ error: "O nome da coluna não pode ficar vazio." }, { status: 400 });
      const atual = await prisma.stage.findUnique({ where: { id }, select: { name: true } });
      if (atual && ETAPAS_DO_SISTEMA.includes(atual.name) && nome !== atual.name) {
        return NextResponse.json({ error: `"${atual.name}" é uma etapa do sistema (régua, metas e IA dependem desse nome) e não pode ser renomeada.` }, { status: 409 });
      }
      data.name = nome;
    }
    if ("color" in body) data.color = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(texto(body.color)) ? texto(body.color) : "#64748b";
    if ("autoResponsavel" in body) {
      const quem = texto(body.autoResponsavel) || null;
      // Responsável automático que não é ninguém da equipe deixava os leads novos invisíveis.
      if (quem && !(await prisma.user.findFirst({ where: { name: quem }, select: { id: true } }))) return NextResponse.json({ error: "Responsável não encontrado na equipe." }, { status: 400 });
      data.autoResponsavel = quem;
    }
    if ("reatribuir" in body) data.reatribuir = !!body.reatribuir;
    if ("distribuicaoPool" in body) data.distribuicaoPool = body.distribuicaoPool || null;
    const stage = await prisma.stage.update({ where: { id }, data });
    return NextResponse.json(stage);
  } catch (err) {
    // Registro do `where` não existe (link velho, dois cliques, id
    // chutado): é "não achei", não erro de servidor.
    if (ehNaoEncontrado(err)) return respostaNaoEncontrado();
    throw err;
  }
}

// Remove uma etapa
export async function DELETE(_req, { params }) {
  try {
    const { id } = await params;
    const st = await prisma.stage.findUnique({ where: { id }, select: { name: true, _count: { select: { contacts: true } } } });
    if (!st) return respostaNaoEncontrado();
    if (ETAPAS_DO_SISTEMA.includes(st.name)) return NextResponse.json({ error: `"${st.name}" é uma etapa do sistema e não pode ser apagada.` }, { status: 409 });
    // Coluna com leads: o banco recusava (erro 500). Avisa para mover os leads antes.
    if (st._count.contacts) return NextResponse.json({ error: `A coluna tem ${st._count.contacts} lead(s). Mova-os para outra coluna antes de apagar.` }, { status: 409 });
    await prisma.stage.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Registro do `where` não existe (link velho, dois cliques, id
    // chutado): é "não achei", não erro de servidor.
    if (ehNaoEncontrado(err)) return respostaNaoEncontrado();
    throw err;
  }
}
