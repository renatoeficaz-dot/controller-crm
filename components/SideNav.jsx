"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Icone from "@/components/Icones";

// Mesma ordem do menu do topo (TopNav) — os dois menus levam aos mesmos
// lugares, então divergir na ordem só confunde quem procura pelo ícone.
const links = [
  { href: "/contatos", label: "Contatos", icon: "funil", pagina: "contatos" },
  { href: "/chat", label: "Chat", icon: "chat", pagina: "chat" },
  { href: "/tarefas", label: "Tarefas", icon: "tarefa", pagina: "tarefas" },
  { href: "/cobranca", label: "Cobrança", icon: "cobranca", pagina: "cobranca" },
  { href: "/metas", label: "Metas", icon: "meta", pagina: "metas" },
  { href: "/lancamentos", label: "Lançamentos", icon: "dinheiro", admin: true },
  { href: "/relatorios", label: "Relatórios", icon: "grafico", pagina: "relatorios" },
  { href: "/configuracoes", label: "Configurações", icon: "engrenagem", admin: true },
  { href: "/aprender", label: "Aprender", icon: "formatura" },
];

// Trilho de ícones fixo à esquerda — atalho rápido entre as seções
// principais, complementar ao menu do topo (mesmas rotas, visual compacto).
export default function SideNav() {
  const pathname = usePathname();
  const [user, setUser] = useState(null);
  const [naoLidas, setNaoLidas] = useState(0);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then(setUser)
      .catch(() => {});
  }, [pathname]);

  // Selo de não lidas no ícone do Chat (item 90) — atualiza a cada 20s, leve
  // o bastante pra não pesar em background.
  const rotaPublica = pathname === "/login" || pathname.startsWith("/v/") || pathname.startsWith("/f/") || pathname.startsWith("/l/");

  useEffect(() => {
    if (rotaPublica) return;
    const carregar = () => fetch("/api/chat/nao-lidas").then((r) => r.json()).then((d) => setNaoLidas(d.total || 0)).catch(() => {});
    carregar();
    const t = setInterval(carregar, 20000);
    return () => clearInterval(t);
  }, [pathname]);

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
            {l.href === "/chat" && naoLidas > 0 && (
              <span className="absolute top-1 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] leading-4 text-center font-medium">
                {naoLidas > 99 ? "99+" : naoLidas}
              </span>
            )}
            <span className="pointer-events-none absolute left-full ml-2 whitespace-nowrap rounded-md bg-slate-800 text-white text-xs px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity z-50">
              {l.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
