import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { registrarAuditoria } from "@/lib/auditoria";
import { lerCorpo, texto } from "@/lib/corpo";

// Ações da conexão com o banco pela Pluggy (só admin):
//   POST { acao: "token", itemId? }          -> token do widget "Conectar conta"
//   POST { acao: "registrar", itemId, bancoId } -> grava as contas do item e já sincroniza
//   POST { acao: "sincronizar" }             -> traz as transações agora
//   PATCH { id, bancoId?, ativo? }           -> liga a conta a outro Banco do sistema / pausa
//   DELETE ?id=                              -> desliga a conta (para de sincronizar)
async function exigirAdmin() {
  const user = await getCurrentUser();
  if (!user) return { erro: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  if (!isAdmin(user)) return { erro: NextResponse.json({ error: "Sem permissão." }, { status: 403 }) };
  return { user };
}

export async function POST(req) {
  const { user, erro } = await exigirAdmin();
  if (erro) return erro;
  const b = await lerCorpo(req);
  const P = await import("@/lib/pluggyServidor");
  try {
    if (b.acao === "token") {
      const proto = req.headers.get("x-forwarded-proto") || "https";
      const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
      const accessToken = await P.criarConnectToken({ itemId: texto(b.itemId) || null, origem: host ? `${proto}://${host}` : null, usuario: user.name });
      return NextResponse.json({ accessToken });
    }
    if (b.acao === "registrar") {
      const itemId = texto(b.itemId);
      if (!itemId) return NextResponse.json({ error: "Conexão sem identificador." }, { status: 400 });
      const bancoId = texto(b.bancoId) || null;
      const r = await P.registrarItem(itemId, bancoId);
      registrarAuditoria({ usuario: user.name, acao: "pluggy_conectar", entidade: "PluggyConta", entidadeId: itemId, detalhe: `${r.contas.length} conta(s): ${r.contas.map((c) => c.nome).join(", ")}` });
      const sync = bancoId ? await P.sincronizarPluggy({ forcarAtualizacao: false }) : null;
      return NextResponse.json({ ok: true, contas: r.contas.length, statusItem: r.statusItem, sync });
    }
    if (b.acao === "sincronizar") {
      const r = await P.sincronizarPluggy({ forcarAtualizacao: !!b.atualizarBanco });
      return NextResponse.json(r);
    }
    return NextResponse.json({ error: "Ação desconhecida." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

export async function PATCH(req) {
  const { user, erro } = await exigirAdmin();
  if (erro) return erro;
  const b = await lerCorpo(req);
  const id = texto(b.id);
  if (!id) return NextResponse.json({ error: "Conta não informada." }, { status: 400 });
  const data = {};
  if (b.bancoId !== undefined) {
    const bancoId = texto(b.bancoId) || null;
    if (bancoId && !(await prisma.banco.findUnique({ where: { id: bancoId }, select: { id: true } }))) return NextResponse.json({ error: "Conta do sistema não encontrada." }, { status: 400 });
    data.bancoId = bancoId;
  }
  if (b.ativo !== undefined) data.ativo = !!b.ativo;
  await prisma.pluggyConta.update({ where: { id }, data });
  registrarAuditoria({ usuario: user.name, acao: "pluggy_conta", entidade: "PluggyConta", entidadeId: id, detalhe: JSON.stringify(data) });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req) {
  const { user, erro } = await exigirAdmin();
  if (erro) return erro;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Conta não informada." }, { status: 400 });
  // Só desliga: os movimentos já trazidos continuam no extrato (são o histórico da conciliação).
  await prisma.pluggyConta.update({ where: { id }, data: { ativo: false } });
  registrarAuditoria({ usuario: user.name, acao: "pluggy_desligar", entidade: "PluggyConta", entidadeId: id, detalhe: "conta desligada" });
  return NextResponse.json({ ok: true });
}
