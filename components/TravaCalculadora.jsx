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
// Usuários que sempre veem a calculadora ao reabrir a tela, mesmo dentro da
// janela de tolerância de 1h — pedido específico: o Hulk atende vídeo chamada
// com o cliente olhando o aparelho, então minimizar (ir pra outra tela) e
// voltar precisa pedir o código de novo toda vez, diferente do resto da
// equipe (que continua sem repetir o código numa troca rápida pro WhatsApp).
const SEMPRE_TRAVAR = ["Hulk"];

export default function TravaCalculadora({ children }) {
  // "checando" evita o pior caso: o app aparecer por um instante antes da
  // calculadora cobrir — quem estivesse olhando veria exatamente o que o
  // disfarce existe pra esconder.
  const [estado, setEstado] = useState("checando"); // checando | travado | livre
  const [sempreTravar, setSempreTravar] = useState(false);

  useEffect(() => {
    // As duas checagens (quem é o usuário + se já destravou) precisam
    // terminar ANTES de decidir o estado — se a trava resolvesse com
    // sempreTravar ainda no valor inicial (false), o Hulk apareceria "livre"
    // por um instante e só corrigiria pra "travado" depois, quando a resposta
    // de /api/auth/me chegasse. Esse instante é exatamente o que o disfarce
    // existe pra evitar.
    let cancelado = false;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => {
        if (cancelado) return;
        const souSempreTravar = !!u?.name && SEMPRE_TRAVAR.includes(u.name);
        setSempreTravar(souSempreTravar);

        // Já destravou (dentro da validade): não pergunta de novo. Renova a
        // validade a partir de AGORA — sem isso, quem trabalha mais de 1h
        // seguida (navegando entre telas, cada uma remontando este
        // componente) cairia na trava no meio do atendimento mesmo sem nunca
        // ter saído do app.
        if (!souSempreTravar && jaDestravado()) {
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
          .then((d) => !cancelado && setEstado(d?.ativo ? "travado" : "livre"))
          // Sem resposta (offline, servidor caindo) o app abre normal: travar
          // por causa de uma falha de rede prenderia todo mundo pra fora.
          .catch(() => !cancelado && setEstado("livre"));
      })
      // /api/auth/me falhou (rede/offline): segue o comportamento padrão,
      // sem saber se é alguém da lista SEMPRE_TRAVAR.
      .catch(() => {
        if (cancelado) return;
        if (jaDestravado()) {
          renovarDestravado();
          return setEstado("livre");
        }
        fetch("/api/auth/calculadora")
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => !cancelado && setEstado(d?.ativo ? "travado" : "livre"))
          .catch(() => !cancelado && setEstado("livre"));
      });
    return () => { cancelado = true; };
  }, []);

  // Voltou de outro app (ex.: WhatsApp) ou desminimizou a tela: pra quem está
  // na lista SEMPRE_TRAVAR, volta a pedir o código sempre; pro resto, só
  // renova a validade se já estava destravado (não pede de novo à toa).
  useEffect(() => {
    function aoVoltar() {
      if (document.visibilityState !== "visible") return;
      if (sempreTravar) return setEstado("travado");
      if (jaDestravado()) renovarDestravado();
    }
    document.addEventListener("visibilitychange", aoVoltar);
    return () => document.removeEventListener("visibilitychange", aoVoltar);
  }, [sempreTravar]);

  if (estado === "checando") return <div className="flex-1 bg-black" />;
  if (estado === "travado") return <CalculadoraEntrada onAbrir={() => setEstado("livre")} />;
  return children;
}
