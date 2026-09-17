"use client";

import { useEffect, useState } from "react";
import CalculadoraEntrada, { jaDestravado, renovarDestravado } from "@/components/CalculadoraEntrada";

// Cobre o app inteiro com a calculadora a CADA abertura, mesmo com a sessão
// já válida — foi o pedido: "que apareça toda vez que for abrir".
//
// Destravar vale por um tempo (não só a aba atual) — ver CalculadoraEntrada.
// Sair rapidinho pro WhatsApp e voltar não trava de novo; ficar sem mexer no
// app por mais de 1h, sim — esse é o "abrir o sistema" de novo.
//
// Continua sendo DISFARCE, não segurança: quem protege os dados é o login.
export default function TravaCalculadora({ children }) {
  // "checando" evita o pior caso: o app aparecer por um instante antes da
  // calculadora cobrir — quem estivesse olhando veria exatamente o que o
  // disfarce existe pra esconder.
  const [estado, setEstado] = useState("checando"); // checando | travado | livre

  useEffect(() => {
    // Já destravou (dentro da validade): não pergunta de novo. Renova a
    // validade a partir de AGORA — sem isso, quem trabalha mais de 1h
    // seguida (navegando entre telas, cada uma remontando este componente)
    // cairia na trava no meio do atendimento mesmo sem nunca ter saído do app.
    if (jaDestravado()) {
      renovarDestravado();
      return setEstado("livre");
    }
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

  // Voltou de outro app (ex.: WhatsApp) com a aba ainda destravada: renova a
  // validade a partir de agora. Sem isso, sair e voltar várias vezes ao
  // longo do dia ia acumulando tempo parado até estourar a 1h mesmo com uso
  // ativo intercalado.
  useEffect(() => {
    function aoVoltar() {
      if (document.visibilityState === "visible" && jaDestravado()) renovarDestravado();
    }
    document.addEventListener("visibilitychange", aoVoltar);
    return () => document.removeEventListener("visibilitychange", aoVoltar);
  }, []);

  if (estado === "checando") return <div className="flex-1 bg-black" />;
  if (estado === "travado") return <CalculadoraEntrada onAbrir={() => setEstado("livre")} />;
  return children;
}
