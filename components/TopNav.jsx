"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const links = [
  { href: "/contatos", label: "Contatos" },
  { href: "/chat", label: "Chat" },
  { href: "/lancamentos", label: "Lançamentos", admin: true },
  { href: "/relatorios", label: "Relatórios" },
  { href: "/chatbot", label: "Chatbot", admin: true },
  { href: "/configuracoes", label: "Configurações", admin: true },
];

export default function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then(setUser)
      .catch(() => {});
  }, [pathname]);

  useEffect(() => { setMenuOpen(false); }, [pathname]);

  if (pathname === "/login") return null;

  const isAdmin = user?.role === "admin";
  const visibleLinks = links.filter((l) => !l.admin || isAdmin);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
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
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-emerald-50 text-emerald-700"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                }`}
              >
                {l.label}
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
                className={`block px-3 py-2 rounded-lg text-sm font-medium ${
                  active ? "bg-emerald-50 text-emerald-700" : "text-slate-600"
                }`}
              >
                {l.label}
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
