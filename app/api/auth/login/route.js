import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { signSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";

// Autentica login + senha e cria a sessão (cookie httpOnly assinado).
export async function POST(req) {
  const { login, password } = await req.json().catch(() => ({}));
  const user = await prisma.user.findUnique({ where: { login: (login || "").trim() } });
  if (!user || !(await bcrypt.compare(password || "", user.passwordHash))) {
    return NextResponse.json({ error: "Login ou senha inválidos." }, { status: 401 });
  }

  const exp = Date.now() + SESSION_MAX_AGE * 1000;
  const token = await signSession({ uid: user.id, role: user.role, name: user.name, exp });

  const res = NextResponse.json({
    ok: true,
    user: { id: user.id, name: user.name, role: user.role },
  });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
