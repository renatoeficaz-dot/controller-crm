"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Icone from "@/components/Icones";
import { tocarAlerta } from "@/lib/somAlerta";
import ChamadaInterna from "@/components/ChamadaInterna";

const INTERVALO = 4000; // chamada não pode demorar pra aparecer

// Fica montado no app inteiro (ver app/layout.js) pra a chamada tocar em
// qualquer tela — a pessoa não fica parada no chat interno esperando.
// Cuida de: receber (tocando + atender/recusar), e manter a janela aberta
// enquanto a chamada estiver ativa, dos dois lados.
export default function ChamadaWatcher() {
  const [euId, setEuId] = useState(null);
  const [chamada, setChamada] = useState(null);      // recebendo (toca)
  const [chamando, setChamando] = useState(null);    // eu liguei, aguardando
  const [aviso, setAviso] = useState("");            // "recusou" / "não atendeu"
  const [emChamada, setEmChamada] = useState(null);
  const jaTocou = useRef(new Set());

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => setEuId(u?.id || null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!euId) return;
    let vivo = true;

    async function checar() {
      const c = await fetch("/api/chamadas").then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (!vivo) return;

      if (!c) {
        setChamada(null);
        // Estava chamando e a chamada sumiu = recusada ou expirou sem
        // ninguém atender. Sem esse aviso, a tela só voltava ao normal e
        // não dava pra saber o que aconteceu.
        setChamando((atual) => {
          if (atual) {
            setAviso("Não atenderam.");
            setTimeout(() => setAviso(""), 4000);
          }
          return null;
        });
        // A janela some quando a chamada sai de "aceita" — ou seja, quando o
        // outro lado desligou.
        setEmChamada(null);
        return;
      }
      if (c.status === "aceita") {
        setChamada(null);
        setChamando(null);
        setEmChamada((atual) => (atual?.id === c.id ? atual : c));
        return;
      }
      if (c.status === "chamando" && c.deId === euId) {
        setChamando(c);
        return;
      }
      if (c.status === "chamando" && c.paraId === euId) {
        setChamada(c);
        // Toca uma vez por chamada — o poll roda a cada 4s e ficaria
        // repetindo o bipe sem parar.
        if (!jaTocou.current.has(c.id)) {
          jaTocou.current.add(c.id);
          tocarAlerta();
        }
      }
    }

    checar();
    const t = setInterval(checar, INTERVALO);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [euId]);

  const responder = useCallback(async (acao) => {
    if (!chamada) return;
    const r = await fetch(`/api/chamadas/${chamada.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao }),
    }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
    setChamada(null);
    if (acao === "aceitar" && r) setEmChamada(r);
  }, [chamada]);

  async function cancelar() {
    if (!chamando) return;
    await fetch(`/api/chamadas/${chamando.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "encerrar" }),
    }).catch(() => {});
    setChamando(null);
  }

  if (emChamada && euId) {
    return <ChamadaInterna chamada={emChamada} euId={euId} onEncerrar={() => setEmChamada(null)} />;
  }

  // Eu liguei e estou esperando atenderem.
  if (chamando) {
    return (
      <div className="fixed bottom-4 left-4 z-[85] bg-slate-800 text-white rounded-xl shadow-2xl px-4 py-3 w-72">
        <div className="flex items-center gap-2.5">
          <span className="w-10 h-10 rounded-full bg-slate-600 flex items-center justify-center text-sm font-semibold animate-pulse">
            {(chamando.para?.name || "?").slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-300">Chamando…</p>
            <p className="text-sm font-medium truncate">{chamando.para?.name}</p>
            <p className="text-[10px] text-slate-400">
              {chamando.video ? "vídeo" : "voz"} · só toca se a pessoa estiver com o sistema aberto
            </p>
          </div>
        </div>
        <button
          onClick={cancelar}
          className="mt-3 w-full bg-red-600 hover:bg-red-700 rounded-lg py-2 text-sm font-medium"
        >
          Cancelar
        </button>
      </div>
    );
  }

  if (aviso && !chamada) {
    return (
      <div className="fixed bottom-4 left-4 z-[85] bg-slate-800 text-white rounded-xl shadow-lg px-4 py-3 text-sm">
        {aviso}
      </div>
    );
  }

  if (!chamada) return null;

  return (
    <div className="fixed bottom-4 left-4 z-[85] bg-slate-800 text-white rounded-xl shadow-2xl px-4 py-3 w-72">
      <div className="flex items-center gap-2.5">
        <span className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center text-sm font-semibold animate-pulse">
          {(chamada.de?.name || "?").slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-emerald-300 font-semibold">
            {chamada.video ? "Chamada de vídeo" : "Chamada de voz"}
          </p>
          <p className="text-sm font-medium truncate">{chamada.de?.name}</p>
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => responder("aceitar")}
          className="flex-1 bg-emerald-500 hover:bg-emerald-600 rounded-lg py-2 text-sm font-medium flex items-center justify-center gap-1.5"
        >
          <Icone nome="cobranca" className="w-4 h-4" /> Atender
        </button>
        <button
          onClick={() => responder("recusar")}
          className="flex-1 bg-red-600 hover:bg-red-700 rounded-lg py-2 text-sm font-medium"
        >
          Recusar
        </button>
      </div>
    </div>
  );
}
