"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// Itens base do menu. `admin: true` => só aparece para administradores.
const links = [
  { href: "/", label: "Rutas" },
  { href: "/contatos", label: "Contatos" },
  { href: "/lancamentos", label: "Lançamentos", admin: true },
  { href: "/relatorios", label: "Relatórios" },
  { href: "/configuracoes", label: "Configurações", admin: true },
];

export default function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then(setUser)
      .catch(() => {});
  }, [pathname]);

  // Não mostra a navbar na tela de login.
  if (pathname === "/login") return null;

  const isAdmin = user?.role === "admin";
  const visibleLinks = links.filter((l) => !l.admin || isAdmin);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex items-center gap-6 px-6 h-14 bg-white border-b border-slate-200 shadow-sm shrink-0">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-white font-bold">
          C
        </div>
        <span className="font-semibold text-slate-800">Controller</span>
      </div>
      <nav className="flex items-center gap-1">
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

      {user && (
        <div className="ml-auto flex items-center gap-3">
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
    </header>
  );
}
