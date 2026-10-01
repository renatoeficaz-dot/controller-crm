"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CHAVE_DESTRAVADO } from "@/components/CalculadoraEntrada";

const links = [
  { href: "/contatos", label: "Contatos", pagina: "contatos" },
  { href: "/chat", label: "Chat", pagina: "chat" },
  { href: "/chat-interno", label: "Chat interno", pagina: "chat-interno" },
  { href: "/tarefas", label: "Tarefas", pagina: "tarefas" },
  { href: "/cobranca", label: "Cobrança", pagina: "cobranca" },
  { href: "/metas", label: "Metas", pagina: "metas" },
  { href: "/lancamentos", label: "Lançamentos", admin: true },
  { href: "/relatorios", label: "Relatórios", pagina: "relatorios" },
  { href: "/configuracoes", label: "Configurações", admin: true },
  { href: "/aprender", label: "Aprender" },
];

export default function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [naoLidas, setNaoLidas] = useState(0);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then(setUser)
      .catch(() => {});
  }, [pathname]);

  useEffect(() => { setMenuOpen(false); }, [pathname]);

  const rotaPublica = pathname === "/login" || pathname.startsWith("/v/") || pathname.startsWith("/f/") || pathname.startsWith("/l/");

  // Selo de não lidas no link "Chat" — mesmo endpoint que o SideNav já usa
  // (que também toca o som); aqui é só o indicador visual pra quem olha o
  // menu de cima.
  useEffect(() => {
    if (rotaPublica) return;
    const carregar = () => fetch("/api/chat/nao-lidas").then((r) => r.json()).then((d) => setNaoLidas(d.total || 0)).catch(() => {});
    carregar();
    const t = setInterval(carregar, 20000);
    return () => clearInterval(t);
  }, [pathname, rotaPublica]);

  if (rotaPublica) return null;

  const isAdmin = user?.role === "admin";
  const paginasPermitidas = isAdmin || !user?.paginasVisiveis
    ? null
    : user.paginasVisiveis.split(",").map((s) => s.trim()).filter(Boolean);
  const visibleLinks = links.filter((l) => {
    if (l.admin) return isAdmin;
    if (!l.pagina || !paginasPermitidas) return true;
    return paginasPermitidas.includes(l.pagina);
  });

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    // Sem isso, a trava continuava "destravada" (localStorage) e a tela de
    // login pulava a calculadora e mostrava o login de verdade na hora — bem
    // no momento em que alguém mais tem chance de olhar o celular.
    try { localStorage.removeItem(CHAVE_DESTRAVADO); } catch {}
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="bg-white border-b border-slate-200 shadow-sm shrink-0">
      <div className="flex items-center justify-between px-4 md:px-6 h-14">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-white font-bold text-sm">
            C
          </div>
          <span className="font-semibold text-slate-800 hidden sm:inline">Controller</span>
        </div>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {visibleLinks.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`relative px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-emerald-50 text-emerald-700"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                }`}
              >
                {l.label}
                {l.href === "/chat" && naoLidas > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] leading-4 text-center font-medium">
                    {naoLidas > 99 ? "99+" : naoLidas}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          {user && (
            <div className="hidden sm:flex items-center gap-3">
              <span className="text-xs text-slate-500">
                {user.name}
                <span className="ml-1 text-[10px] uppercase tracking-wide text-slate-400">({user.role})</span>
              </span>
              <button
                onClick={logout}
                className="text-xs text-slate-500 hover:text-red-600 border border-slate-200 rounded-lg px-2.5 py-1"
              >
                Sair
              </button>
            </div>
          )}

          {/* Hamburguer (mobile) */}
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg hover:bg-slate-100"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-slate-600">
              {menuOpen ? (
                <path d="M5 5l10 10M15 5L5 15" />
              ) : (
                <path d="M3 5h14M3 10h14M3 15h14" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <nav className="md:hidden border-t border-slate-100 bg-white px-4 py-2 space-y-1">
          {visibleLinks.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`relative block px-3 py-2 rounded-lg text-sm font-medium ${
                  active ? "bg-emerald-50 text-emerald-700" : "text-slate-600"
                }`}
              >
                {l.label}
                {l.href === "/chat" && naoLidas > 0 && (
                  <span className="ml-1.5 inline-block min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] leading-4 text-center font-medium align-middle">
                    {naoLidas > 99 ? "99+" : naoLidas}
                  </span>
                )}
              </Link>
            );
          })}
          {user && (
            <div className="flex items-center justify-between px-3 py-2 border-t border-slate-100 mt-2 pt-2">
              <span className="text-xs text-slate-500">{user.name} ({user.role})</span>
              <button onClick={logout} className="text-xs text-red-500">Sair</button>
            </div>
          )}
        </nav>
      )}
    </header>
  );
}
