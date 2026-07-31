import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSession } from "@/lib/session";
import { registrarAuditoria } from "@/lib/auditoria";

// Edita um usuário (nome, login e/ou senha). Senha só muda se for enviada.
export async function PATCH(req, { params }) {
  const { id } = await params;
  const body = await req.json();
  const data = {};

  if ("name" in body) {
    const name = (body.name || "").trim();
    if (!name) return NextResponse.json({ error: "Nome não pode ficar vazio." }, { status: 400 });
    data.name = name;
  }

  if ("login" in body) {
    const login = (body.login || "").trim();
    if (!login) return NextResponse.json({ error: "Login não pode ficar vazio." }, { status: 400 });
    const other = await prisma.user.findUnique({ where: { login } });
    if (other && other.id !== id) {
      return NextResponse.json({ error: "Já existe um usuário com esse login." }, { status: 409 });
    }
    data.login = login;
  }

  // Só troca a senha se vier preenchida
  if (body.password) {
    data.passwordHash = await bcrypt.hash(body.password, 10);
  }

  const ROLES = ["admin", "vendedor", "cobrador"];
  if ("role" in body && ROLES.includes(body.role)) data.role = body.role;
  if ("verTodosLeads" in body) data.verTodosLeads = !!body.verTodosLeads;
  if ("paginasVisiveis" in body) data.paginasVisiveis = (body.paginasVisiveis || []).join(",") || null;
  // Admin sempre vê tudo (não faz sentido restringir)
  if (data.role === "admin") {
    data.verTodosLeads = true;
    data.paginasVisiveis = null;
  }
  if ("permissoesExtras" in body) data.permissoesExtras = (body.permissoesExtras || []).join(",") || null;
  if ("somenteLeitura" in body) data.somenteLeitura = !!body.somenteLeitura;
  if ("equipeId" in body) data.equipeId = body.equipeId || null;
  if ("kanbansVisiveis" in body) {
    data.kanbansVisiveis = { set: (body.kanbansVisiveis || []).map((kid) => ({ id: kid })) };
  }
  if ("numerosVisiveis" in body) {
    data.numerosVisiveis = { set: (body.numerosVisiveis || []).map((nid) => ({ id: nid })) };
  }

  // Meta individual: vazio = null = usa a meta global (não é meta de zero).
  const metaOuNull = (v) => (v === "" || v == null ? null : Number(v) || null);
  for (const campo of ["metaVendasMinimaPropria", "metaVendasMediaPropria", "metaVendasDiaPropria"]) {
    if (campo in body) data[campo] = metaOuNull(body[campo]);
  }

  const antes = await prisma.user.findUnique({
    where: { id },
    select: { name: true, role: true, verTodosLeads: true, paginasVisiveis: true },
  });

  const user = await prisma.user.update({
    where: { id },
    data,
    select: {
      id: true,
      name: true,
      login: true,
      role: true,
      verTodosLeads: true,
      paginasVisiveis: true,
      kanbansVisiveis: { select: { id: true } },
      numerosVisiveis: { select: { id: true } },
      metaVendasMinimaPropria: true,
      metaVendasMediaPropria: true,
      metaVendasDiaPropria: true,
      createdAt: true,
    },
  });

  // Auditoria só quando permissão/nível mudou de fato — trocar o nome do
  // usuário não é evento de segurança e só faria ruído no log.
  const mudouPermissao =
    (antes && "role" in data && antes.role !== user.role) ||
    ("verTodosLeads" in data && antes?.verTodosLeads !== user.verTodosLeads) ||
    ("paginasVisiveis" in data && antes?.paginasVisiveis !== user.paginasVisiveis) ||
    "kanbansVisiveis" in data ||
    "numerosVisiveis" in data;
  if (mudouPermissao) {
    const session = await getSession();
    registrarAuditoria({
      usuario: session?.name,
      acao: "alterar_permissao",
      entidade: "User",
      entidadeId: id,
      detalhe: `${user.name}: nível ${user.role}, vê todos os leads: ${user.verTodosLeads ? "sim" : "não"}`,
    });
  }
  if (body.password) {
    const session = await getSession();
    registrarAuditoria({
      usuario: session?.name,
      acao: "trocar_senha",
      entidade: "User",
      entidadeId: id,
      detalhe: `Senha de ${user.name} foi alterada`,
    });
  }

  return NextResponse.json(user);
}

// Remove um usuário
export async function DELETE(_req, { params }) {
  const { id } = await params;
  const [session, alvo] = await Promise.all([
    getSession(),
    prisma.user.findUnique({ where: { id }, select: { name: true, role: true } }),
  ]);
  await prisma.user.delete({ where: { id } });
  registrarAuditoria({
    usuario: session?.name,
    acao: "excluir_usuario",
    entidade: "User",
    entidadeId: id,
    detalhe: alvo ? `${alvo.name} (${alvo.role})` : null,
  });
  return NextResponse.json({ ok: true });
}
