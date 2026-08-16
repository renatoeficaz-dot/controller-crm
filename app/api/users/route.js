import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { lerCorpo } from "@/lib/corpo";

const ROLES = ["admin", "vendedor", "cobrador"];
const USER_SELECT = {
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
  permissoesExtras: true,
  somenteLeitura: true,
  ultimoAcessoEm: true,
  equipeId: true,
  createdAt: true,
};

// Meta individual: campo vazio significa "usa a meta global" — por isso null,
// e não 0 (que seria uma meta de zero vendas).
const metaOuNull = (v) => (v === "" || v == null ? null : Number(v) || null);

// Campos que só o admin pode ver. `login` é metade da credencial: a tela de
// login gasta bcrypt de propósito pra não revelar quais logins existem, e essa
// rota entregava a lista inteira pra qualquer um logado. O resto (permissões,
// somenteLeitura, último acesso) diz qual conta vale a pena atacar — conta
// parada de admin é o alvo ideal.
const CAMPOS_SO_ADMIN = [
  "login", "permissoesExtras", "paginasVisiveis", "somenteLeitura",
  "verTodosLeads", "ultimoAcessoEm",
  "metaVendasMinimaPropria", "metaVendasMediaPropria", "metaVendasDiaPropria",
];

// Lista os usuários (sem expor o hash da senha), com nível e permissões
export async function GET() {
  const users = await prisma.user.findMany({ orderBy: { name: "asc" }, select: USER_SELECT });
  const user = await getCurrentUser().catch(() => null);
  if (isAdmin(user)) return NextResponse.json(users);

  // As telas comuns (seletor de responsável no Chat, Kanban, ficha do lead)
  // só precisam de id/nome — nunca dos campos acima.
  const seguro = users.map((u) => {
    const copia = { ...u };
    for (const campo of CAMPOS_SO_ADMIN) delete copia[campo];
    return copia;
  });
  return NextResponse.json(seguro);
}

// Cria um usuário (nome, login, senha, nível e permissões)
export async function POST(req) {
  const body = await lerCorpo(req);
  const name = (body.name || "").trim();
  const login = (body.login || "").trim();
  const password = body.password || "";

  if (!name || !login || !password) {
    return NextResponse.json({ error: "Preencha nome, login e senha." }, { status: 400 });
  }
  // Sem mínimo dava pra criar um administrador com a senha "1".
  if (password.length < 6) {
    return NextResponse.json({ error: "A senha precisa ter ao menos 6 caracteres." }, { status: 400 });
  }

  const exists = await prisma.user.findUnique({ where: { login } });
  if (exists) {
    return NextResponse.json({ error: "Já existe um usuário com esse login." }, { status: 409 });
  }

  const role = ROLES.includes(body.role) ? body.role : "vendedor";
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      name,
      login,
      passwordHash,
      role,
      verTodosLeads: role === "admin" ? true : !!body.verTodosLeads,
      paginasVisiveis: role === "admin" ? null : (body.paginasVisiveis || []).join(",") || null,
      kanbansVisiveis: { connect: (body.kanbansVisiveis || []).map((id) => ({ id })) },
      numerosVisiveis: { connect: (body.numerosVisiveis || []).map((id) => ({ id })) },
      metaVendasMinimaPropria: metaOuNull(body.metaVendasMinimaPropria),
      metaVendasMediaPropria: metaOuNull(body.metaVendasMediaPropria),
      metaVendasDiaPropria: metaOuNull(body.metaVendasDiaPropria),
      permissoesExtras: (body.permissoesExtras || []).join(",") || null,
      somenteLeitura: !!body.somenteLeitura,
      equipeId: body.equipeId || null,
    },
    select: USER_SELECT,
  });
  return NextResponse.json(user);
}
