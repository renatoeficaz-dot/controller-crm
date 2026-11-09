import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { lerFormulario, lerCorpo, texto } from "@/lib/corpo";
import { decodificarOfx } from "@/lib/conciliacaoOfx";
import { importarOfx, estadoConciliacao, rodarConciliacao } from "@/lib/conciliacaoServidor";

const MAX_BYTES = 5 * 1024 * 1024;

async function bancoPadrao(bancoId) {
  if (bancoId) return bancoId;
  const cfg = await prisma.config.findUnique({ where: { id: "singleton" }, select: { contaRecebimentoId: true } });
  if (cfg?.contaRecebimentoId) return cfg.contaRecebimentoId;
  return (await prisma.banco.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } }))?.id || null;
}

async function exigirAdmin() {
  const user = await getCurrentUser();
  if (!user) return { erro: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  if (!isAdmin(user)) return { erro: NextResponse.json({ error: "Sem permissão." }, { status: 403 }) };
  return { user };
}

// Estado da aba Conciliação (pendências, caixa, histórico).
export async function GET(req) {
  const { erro } = await exigirAdmin();
  if (erro) return erro;
  const bancoId = await bancoPadrao(new URL(req.url).searchParams.get("bancoId"));
  if (!bancoId) return NextResponse.json({ error: "Cadastre uma conta (banco) antes." }, { status: 400 });
  return NextResponse.json({ bancoId, ...(await estadoConciliacao(bancoId)) });
}

// Importa o OFX do dia (multipart: arquivo + bancoId opcional).
export async function POST(req) {
  const { user, erro } = await exigirAdmin();
  if (erro) return erro;
  const form = await lerFormulario(req);
  const arquivo = form?.get("arquivo");
  if (!arquivo || typeof arquivo === "string" || typeof arquivo.arrayBuffer !== "function") return NextResponse.json({ error: "Envie o arquivo OFX." }, { status: 400 });
  if (arquivo.size > MAX_BYTES) return NextResponse.json({ error: "Arquivo grande demais (máximo 5 MB)." }, { status: 413 });
  const bancoId = await bancoPadrao(texto(form.get("bancoId")));
  if (!bancoId) return NextResponse.json({ error: "Cadastre uma conta (banco) antes." }, { status: 400 });
  try {
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    const r = await importarOfx({ texto: decodificarOfx(bytes), arquivo: arquivo.name, bancoId, usuario: user.name });
    return NextResponse.json({ ok: true, bancoId, ...r });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Não consegui ler o arquivo." }, { status: 400 });
  }
}

// Conferir à mão um lançamento que não tem Pix no extrato (ex.: pago em dinheiro, ou entrou em outra conta).
export async function PATCH(req) {
  const { user, erro } = await exigirAdmin();
  if (erro) return erro;
  const body = await lerCorpo(req);
  if (body.reconferir) {
    // Roda o casamento de novo sobre o que está pendente (depois de melhorias na conferência ou de lançamentos novos).
    const bancoId = await bancoPadrao(texto(body.bancoId));
    if (!bancoId) return NextResponse.json({ error: "Cadastre uma conta (banco) antes." }, { status: 400 });
    return NextResponse.json({ ok: true, ...(await rodarConciliacao(bancoId)) });
  }
  const id = texto(body.lancamentoId);
  if (!id) return NextResponse.json({ error: "Informe o lançamento." }, { status: 400 });
  const l = await prisma.lancamento.findUnique({ where: { id }, select: { id: true } });
  if (!l) return NextResponse.json({ error: "Lançamento não encontrado." }, { status: 404 });
  await prisma.lancamento.update({ where: { id }, data: { conciliadoEm: new Date() } });
  await prisma.auditLog.create({ data: { usuario: user.name, acao: "conferir_lancamento_manual", entidade: "Lancamento", entidadeId: id, detalhe: texto(body.observacao) || null } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
