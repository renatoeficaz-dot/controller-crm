import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

const ROLES = ["admin", "vendedor", "cobrador"];
const USER_SELECT = {
  id: true,
  name: true,
  login: true,
  role: true,
  verTodosLeads: true,
  kanbansVisiveis: { select: { id: true } },
  numerosVisiveis: { select: { id: true } },
  createdAt: true,
};

// Lista os usuários (sem expor o hash da senha), com nível e permissões
export async function GET() {
  const users = await prisma.user.findMany({ orderBy: { name: "asc" }, select: USER_SELECT });
  return NextResponse.json(users);
}

// Cria um usuário (nome, login, senha, nível e permissões)
export async function POST(req) {
  const body = await req.json();
  const name = (body.name || "").trim();
  const login = (body.login || "").trim();
  const password = body.password || "";

  if (!name || !login || !password) {
    return NextResponse.json({ error: "Preencha nome, login e senha." }, { status: 400 });
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
      kanbansVisiveis: { connect: (body.kanbansVisiveis || []).map((id) => ({ id })) },
      numerosVisiveis: { connect: (body.numerosVisiveis || []).map((id) => ({ id })) },
    },
    select: USER_SELECT,
  });
  return NextResponse.json(user);
}
