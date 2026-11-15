import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { signSession, SESSION_COOKIE } from "@/lib/auth";
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
  // Entrar como outro ADMIN não serve pra depurar permissão (é o mesmo acesso) e só servia pra agir com o nome de outra pessoa na
  // auditoria. Usuário suspenso também não: "entrar como" furava a suspensão.
  if (alvo.role === "admin") return NextResponse.json({ error: "Não dá para entrar como outro administrador." }, { status: 403 });
  if (alvo.suspensoAte && alvo.suspensoAte.getTime() > Date.now()) return NextResponse.json({ error: "Esse usuário está suspenso." }, { status: 403 });

  registrarAuditoria({
    usuario: admin.name,
    acao: "impersonate",
    entidade: "User",
    entidadeId: alvo.id,
    detalhe: `${admin.name} entrou como ${alvo.name} (${alvo.login})`,
  });

  // Sessão de "entrar como" dura 2 horas (antes eram 30 dias, igual a um login normal) e leva quem entrou (imp).
  const DURACAO_S = 2 * 3600;
  const exp = Date.now() + DURACAO_S * 1000;
  const token = await signSession({
    uid: alvo.id,
    role: alvo.role,
    name: alvo.name,
    somenteLeitura: !!alvo.somenteLeitura,
    paginas: alvo.paginasVisiveis || null,
    imp: admin.id,
    exp,
  });

  const res = NextResponse.json({ ok: true, user: { id: alvo.id, name: alvo.name, role: alvo.role } });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: DURACAO_S,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
