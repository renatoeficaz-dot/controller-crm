import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Encerra a sessão. Antes só limpava o cookie: o token continuava válido até vencer (30 dias), então quem tivesse copiado o cookie
// (computador compartilhado, extensão do navegador) seguia entrando mesmo depois do "Sair". Agora o id da sessão vai pra lista de
// revogadas e o middleware recusa esse token.
export async function POST() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const s = token ? await verifySession(token) : null;
  if (s?.jti) {
    await prisma.sessaoRevogada
      .upsert({ where: { jti: s.jti }, update: {}, create: { jti: s.jti, exp: new Date(s.exp || Date.now() + 30 * 86400e3) } })
      .catch(() => {});
    // Faxina: revogação de sessão que já venceu não serve pra nada.
    prisma.sessaoRevogada.deleteMany({ where: { exp: { lt: new Date() } } }).catch(() => {});
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0, secure: process.env.NODE_ENV === "production" });
  return res;
}
