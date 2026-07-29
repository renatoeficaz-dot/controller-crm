"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Icone from "@/components/Icones";

const links = [
  { href: "/chat", label: "Chat", icon: "chat", pagina: "chat" },
  { href: "/tarefas", label: "Tarefas", icon: "tarefa", pagina: "tarefas" },
  { href: "/cobranca", label: "Cobrança", icon: "cobranca", pagina: "cobranca" },
  { href: "/metas", label: "Metas", icon: "meta", pagina: "metas" },
  { href: "/lancamentos", label: "Lançamentos", icon: "dinheiro", admin: true },
  { href: "/contatos", label: "Contatos", icon: "funil", pagina: "contatos" },
  { href: "/relatorios", label: "Relatórios", icon: "grafico", pagina: "relatorios" },
  { href: "/configuracoes", label: "Configurações", icon: "engrenagem", admin: true },
  { href: "/aprender", label: "Aprender", icon: "formatura" },
];

// Trilho de ícones fixo à esquerda — atalho rápido entre as seções
// principais, complementar ao menu do topo (mesmas rotas, visual compacto).
export default function SideNav() {
  const pathname = usePathname();
  const [user, setUser] = useState(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then(setUser)
      .catch(() => {});
  }, [pathname]);

  if (pathname === "/login") return null;

  const isAdmin = user?.role === "admin";
  const paginasPermitidas = isAdmin || !user?.paginasVisiveis
    ? null
    : user.paginasVisiveis.split(",").map((s) => s.trim()).filter(Boolean);
  const visibleLinks = links.filter((l) => {
    if (l.admin) return isAdmin;
    if (!l.pagina || !paginasPermitidas) return true;
    return paginasPermitidas.includes(l.pagina);
  });

  return (
    <nav className="hidden md:flex flex-col items-center gap-1 w-14 shrink-0 bg-white border-r border-slate-200 py-3">
      {visibleLinks.map((l) => {
        const active = pathname === l.href || pathname.startsWith(l.href + "/");
        return (
          <Link
            key={l.href}
            href={l.href}
            title={l.label}
            className={`group relative w-10 h-10 flex items-center justify-center rounded-xl transition-colors ${
              active ? "bg-emerald-50 text-emerald-600" : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            }`}
          >
            <Icone nome={l.icon} className="w-5 h-5" />
            <span className="pointer-events-none absolute left-full ml-2 whitespace-nowrap rounded-md bg-slate-800 text-white text-xs px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity z-50">
              {l.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
