"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const links = [
  { href: "/chat", label: "Chat", icon: "💬" },
  { href: "/tarefas", label: "Tarefas", icon: "✅" },
  { href: "/metas", label: "Metas", icon: "🎯" },
  { href: "/lancamentos", label: "Lançamentos", icon: "💲", admin: true },
  { href: "/contatos", label: "Contatos", icon: "👥" },
  { href: "/relatorios", label: "Relatórios", icon: "📊" },
  { href: "/chatbot", label: "Chatbot", icon: "🤖", admin: true },
  { href: "/configuracoes", label: "Configurações", icon: "⚙️", admin: true },
];

// Trilho de ícones fixo à esquerda — atalho rápido entre as seções
// principais, complementar ao menu do topo (mesmas rotas, visual compacto).
export default function SideNav() {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => setIsAdmin(u?.role === "admin"))
      .catch(() => {});
  }, [pathname]);

  if (pathname === "/login") return null;

  const visibleLinks = links.filter((l) => !l.admin || isAdmin);

  return (
    <nav className="hidden md:flex flex-col items-center gap-1 w-14 shrink-0 bg-white border-r border-slate-200 py-3">
      {visibleLinks.map((l) => {
        const active = pathname === l.href || pathname.startsWith(l.href + "/");
        return (
          <Link
            key={l.href}
            href={l.href}
            title={l.label}
            className={`group relative w-10 h-10 flex items-center justify-center rounded-xl text-lg transition-colors ${
              active ? "bg-emerald-50 text-emerald-600" : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            }`}
          >
            {l.icon}
            <span className="pointer-events-none absolute left-full ml-2 whitespace-nowrap rounded-md bg-slate-800 text-white text-xs px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity z-50">
              {l.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
