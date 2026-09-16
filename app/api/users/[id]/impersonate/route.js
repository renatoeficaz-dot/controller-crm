import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { signSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";

// "Entrar como" — só admin. Assina uma sessão normal pro usuário alvo, sem
// precisar saber a senha dele. Serve pra depurar de verdade o que um cobrador
// específico vê (permissões de kanban/número às vezes só ficam claras
// olhando pela conta da pessoa, não só lendo a configuração).
export async function POST(req, { params }) {
  const { id } = await params;
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "admin") {
    return NextResponse.json({ error: "Só administrador pode entrar como outro usuário." }, { status: 403 });
  }

  const alvo = await prisma.user.findUnique({ where: { id } });
  if (!alvo) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });

  registrarAuditoria({
    usuario: admin.name,
    acao: "impersonate",
    entidade: "User",
    entidadeId: alvo.id,
    detalhe: `${admin.name} entrou como ${alvo.name} (${alvo.login})`,
  });

  const exp = Date.now() + SESSION_MAX_AGE * 1000;
  const token = await signSession({
    uid: alvo.id,
    role: alvo.role,
    name: alvo.name,
    somenteLeitura: !!alvo.somenteLeitura,
    paginas: alvo.paginasVisiveis || null,
    exp,
  });

  const res = NextResponse.json({ ok: true, user: { id: alvo.id, name: alvo.name, role: alvo.role } });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
