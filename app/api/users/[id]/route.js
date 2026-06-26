import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

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
  // Admin sempre vê tudo (não faz sentido restringir)
  if (data.role === "admin") data.verTodosLeads = true;
  if ("kanbansVisiveis" in body) {
    data.kanbansVisiveis = { set: (body.kanbansVisiveis || []).map((kid) => ({ id: kid })) };
  }
  if ("numerosVisiveis" in body) {
    data.numerosVisiveis = { set: (body.numerosVisiveis || []).map((nid) => ({ id: nid })) };
  }

  const user = await prisma.user.update({
    where: { id },
    data,
    select: {
      id: true,
      name: true,
      login: true,
      role: true,
      verTodosLeads: true,
      kanbansVisiveis: { select: { id: true } },
      numerosVisiveis: { select: { id: true } },
      createdAt: true,
    },
  });
  return NextResponse.json(user);
}

// Remove um usuário
export async function DELETE(_req, { params }) {
  const { id } = await params;
  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
