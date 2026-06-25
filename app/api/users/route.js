import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

// Lista os usuários (sem expor o hash da senha)
export async function GET() {
  const users = await prisma.user.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, login: true, createdAt: true },
  });
  return NextResponse.json(users);
}

// Cria um usuário (nome, login, senha)
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

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { name, login, passwordHash },
    select: { id: true, name: true, login: true, createdAt: true },
  });
  return NextResponse.json(user);
}
