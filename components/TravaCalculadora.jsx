"use client";

import { useEffect, useState } from "react";
import CalculadoraEntrada from "@/components/CalculadoraEntrada";

// Cobre o app inteiro com a calculadora a CADA abertura, mesmo com a sessão
// já válida — foi o pedido: "que apareça toda vez que for abrir".
//
// O estado fica só em memória de propósito. Guardar em sessionStorage
// sobreviveria ao F5 e a tela voltaria destravada, que é justamente o
// contrário do pedido. Navegar dentro do app não repete a pergunta, porque o
// layout não remonta na navegação do Next.
//
// Continua sendo DISFARCE, não segurança: quem protege os dados é o login.
export default function TravaCalculadora({ children }) {
  // "checando" evita o pior caso: o app aparecer por um instante antes da
  // calculadora cobrir — quem estivesse olhando veria exatamente o que o
  // disfarce existe pra esconder.
  const [estado, setEstado] = useState("checando"); // checando | travado | livre

  useEffect(() => {
    // A tela de login tem a própria calculadora; travar de novo aqui
    // empilharia duas.
    if (window.location.pathname === "/login") return setEstado("livre");
    // Saída de emergência, igual à do login.
    if (new URLSearchParams(window.location.search).get("direto")) return setEstado("livre");

    fetch("/api/auth/calculadora")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setEstado(d?.ativo ? "travado" : "livre"))
      // Sem resposta (offline, servidor caindo) o app abre normal: travar
      // por causa de uma falha de rede prenderia todo mundo pra fora.
      .catch(() => setEstado("livre"));
  }, []);

  if (estado === "checando") return <div className="flex-1 bg-black" />;
  if (estado === "travado") return <CalculadoraEntrada onAbrir={() => setEstado("livre")} />;
  return children;
}
