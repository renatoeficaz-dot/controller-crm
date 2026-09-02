"use client";

import { useEffect, useState } from "react";
import CalculadoraEntrada, { jaDestravado } from "@/components/CalculadoraEntrada";

// Cobre o app inteiro com a calculadora a CADA abertura, mesmo com a sessão
// já válida — foi o pedido: "que apareça toda vez que for abrir".
//
// Destravar vale pra aba inteira (sessionStorage), não só pra este componente:
// algumas telas recarregam a página de verdade, e aí a trava remontava e
// pedia o código no meio do trabalho. Fechando a aba/app, ela volta — que é
// o "abrir o sistema" de novo.
//
// Continua sendo DISFARCE, não segurança: quem protege os dados é o login.
export default function TravaCalculadora({ children }) {
  // "checando" evita o pior caso: o app aparecer por um instante antes da
  // calculadora cobrir — quem estivesse olhando veria exatamente o que o
  // disfarce existe pra esconder.
  const [estado, setEstado] = useState("checando"); // checando | travado | livre

  useEffect(() => {
    // Já destravou nesta aba: não pergunta de novo a cada navegação.
    if (jaDestravado()) return setEstado("livre");
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
