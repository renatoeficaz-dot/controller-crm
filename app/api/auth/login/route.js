import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { signSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";
import { lerCorpo } from "@/lib/corpo";

const JANELA_MIN = 15;      // conta as falhas dos últimos 15 minutos
const MAX_POR_LOGIN = 8;    // erros no MESMO login antes de travar
const MAX_POR_IP = 20;      // erros do MESMO IP (cobre ataque varrendo vários logins)

// Hash descartável só pra gastar o mesmo tempo de bcrypt quando o login não
// existe. Sem isso, "usuário inexistente" respondia ~0,68s e "usuário real com
// senha errada" ~1,10s — a diferença denunciava quais logins existem de fato,
// e é justamente a lista que o atacante precisa antes de tentar força bruta.
const HASH_FALSO = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

function ipDe(req) {
  const xf = req.headers.get("x-forwarded-for");
  return (xf ? xf.split(",")[0] : req.headers.get("x-real-ip") || "").trim() || null;
}

// Autentica login + senha e cria a sessão (cookie httpOnly assinado).
export async function POST(req) {
  const { login, password } = await lerCorpo(req);
  const loginLimpo = (login || "").trim();
  const ip = ipDe(req);
  const desde = new Date(Date.now() - JANELA_MIN * 60 * 1000);

  // Força bruta: não havia NENHUM limite — 15 tentativas seguidas passaram sem
  // nem atrasar. Com senha fraca, uma conta cai em minutos.
  const [falhasLogin, falhasIp] = await Promise.all([
    loginLimpo ? prisma.loginTentativa.count({ where: { login: loginLimpo, createdAt: { gte: desde } } }) : 0,
    ip ? prisma.loginTentativa.count({ where: { ip, createdAt: { gte: desde } } }) : 0,
  ]);
  if (falhasLogin >= MAX_POR_LOGIN || falhasIp >= MAX_POR_IP) {
    return NextResponse.json(
      { error: `Muitas tentativas. Espere ${JANELA_MIN} minutos e tente de novo.` },
      { status: 429 }
    );
  }

  const user = await prisma.user.findUnique({ where: { login: loginLimpo } });
  // Compara SEMPRE, mesmo sem usuário, pra o tempo de resposta não entregar
  // se o login existe (ver HASH_FALSO acima).
  const senhaOk = await bcrypt.compare(password || "", user?.passwordHash || HASH_FALSO);

  if (!user || !senhaOk) {
    await prisma.loginTentativa.create({ data: { login: loginLimpo || "(vazio)", ip } }).catch(() => {});
    return NextResponse.json({ error: "Login ou senha inválidos." }, { status: 401 });
  }

  // Acertou: zera o contador desse login pra não punir quem só errou antes.
  prisma.loginTentativa.deleteMany({ where: { login: loginLimpo } }).catch(() => {});

  const exp = Date.now() + SESSION_MAX_AGE * 1000;
  // somenteLeitura vai dentro do token (igual role/name) pra o middleware
  // conseguir barrar escrita sem precisar consultar o banco a cada request
  // (o middleware roda em Edge, sem acesso ao SQLite).
  // `paginas` vai junto pelo mesmo motivo de somenteLeitura: o middleware roda
  // em Edge e não consulta o banco, então precisa da restrição dentro do token.
  const token = await signSession({
    uid: user.id,
    role: user.role,
    name: user.name,
    somenteLeitura: !!user.somenteLeitura,
    paginas: user.paginasVisiveis || null,
    exp,
  });

  // Último acesso (item 139) — não bloqueia o login se falhar, é só registro.
  prisma.user.update({ where: { id: user.id }, data: { ultimoAcessoEm: new Date() } }).catch(() => {});

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
