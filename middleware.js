import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

// Rotas públicas (não exigem login).
// /api/webhook precisa ficar aberto para a Evolution entregar mensagens.
// /l/ é o link público de rastreamento (redireciona pro WhatsApp) e /f/ é o
// formulário de pré-cadastro que ele pode abrir — os dois são o lead
// preenchendo, não um usuário do CRM. Precisa da barra no fim pra não bater
// com "/lancamentos" (que É protegida).
const PUBLIC_PREFIXES = ["/api/auth/login", "/api/auth/logout", "/api/webhook", "/login", "/l/", "/f/", "/api/formulario"];

export async function middleware(req) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p))) {
    // se já está logado e tenta abrir /login, manda pra home
    if (pathname === "/login") {
      const token = req.cookies.get(SESSION_COOKIE)?.value;
      if (token && (await verifySession(token))) return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;
  if (session) {
    // Páginas exclusivas de administrador
    const adminPages = ["/configuracoes", "/lancamentos"];
    const isAdminPage = adminPages.some((p) => pathname === p || pathname.startsWith(p + "/"));
    if (isAdminPage && session.role !== "admin") {
      return NextResponse.redirect(new URL("/", req.url));
    }
    // Modo somente leitura (item 146): vê tudo, mas o servidor recusa
    // qualquer escrita — mesmo que a tela tente mandar por engano.
    if (session.somenteLeitura && pathname.startsWith("/api/") && req.method !== "GET") {
      return NextResponse.json({ error: "Seu usuário é somente leitura." }, { status: 403 });
    }
    return NextResponse.next();
  }

  // Não autenticado
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const url = new URL("/login", req.url);
  return NextResponse.redirect(url);
}

// Aplica a todas as rotas, exceto assets estáticos do Next e arquivos com extensão.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico)$).*)"],
};
