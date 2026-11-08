"use client";

import { useEffect, useState } from "react";
import Icone from "@/components/Icones";

const DEZ_MINUTOS = 10 * 60 * 1000;
const LS_DISPENSADOS = "conferenciaMetas_dispensados";

function lerDispensados() {
  try { const v = JSON.parse(localStorage.getItem(LS_DISPENSADOS)); return Array.isArray(v) ? v : []; } catch { return []; }
}

function haQuanto(quando) {
  const min = Math.max(0, Math.round((Date.now() - new Date(quando).getTime()) / 60000));
  if (min < 60) return `há ${min} min`;
  return `há ${Math.floor(min / 60)} h`;
}

// Faixa vermelha no rodapé dos admins quando a conferência automática das metas (de hora em hora) achar números divergindo entre telas,
// caixa lançado em dobro ou mudança de etapa sem registro. É o caminho do aviso que não depende de WhatsApp: some quando o admin dispensa
// (fica lembrado só neste navegador) ou depois de 24 h. Sem divergência não aparece nada.
export default function ConferenciaMetasAviso() {
  const [admin, setAdmin] = useState(false);
  const [lista, setLista] = useState([]);
  const [dispensados, setDispensados] = useState([]);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    let cancelado = false;
    fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)).then((u) => {
      if (!cancelado && u?.role === "admin") setAdmin(true);
    }).catch(() => {});
    return () => { cancelado = true; };
  }, []);

  useEffect(() => {
    if (!admin) return;
    let cancelado = false;
    setDispensados(lerDispensados());
    async function checar() {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/metas/conferencia");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelado) setLista(Array.isArray(data.divergencias) ? data.divergencias : []);
      } catch {
        // rede fora: mantém o que já estava na tela
      }
    }
    checar();
    const t = setInterval(checar, DEZ_MINUTOS);
    const onVisivel = () => { if (!document.hidden) checar(); };
    document.addEventListener("visibilitychange", onVisivel);
    return () => { cancelado = true; clearInterval(t); document.removeEventListener("visibilitychange", onVisivel); };
  }, [admin]);

  const pendentes = lista.filter((d) => !dispensados.includes(d.id));
  if (!admin || !pendentes.length) return null;

  const itens = pendentes.flatMap((d) => d.itens);
  const maisNovo = pendentes[0];

  function dispensar() {
    const ids = [...new Set([...dispensados, ...pendentes.map((d) => d.id)])].slice(-50);
    setDispensados(ids);
    try { localStorage.setItem(LS_DISPENSADOS, JSON.stringify(ids)); } catch {}
  }

  return (
    <div className="shrink-0 bg-red-600 text-white text-xs px-4 py-2" role="alert">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-semibold flex items-center gap-1"><Icone nome="alerta" className="w-3.5 h-3.5" /> Conferência das metas:</span>
        <span className="text-red-50">os números divergiram ({haQuanto(maisNovo.quando)}). {itens.length === 1 ? itens[0] : `${itens.length} avisos.`}</span>
        <div className="ml-auto flex items-center gap-3">
          {itens.length > 1 && (
            <button onClick={() => setAberto((a) => !a)} className="underline underline-offset-2 hover:text-red-100">{aberto ? "Ocultar" : "Ver avisos"}</button>
          )}
          <a href="/metas" className="underline underline-offset-2 hover:text-red-100">Abrir Metas</a>
          <button onClick={dispensar} className="bg-red-700/60 hover:bg-red-700 rounded-full px-2.5 py-0.5">Dispensar</button>
        </div>
      </div>
      {aberto && itens.length > 1 && (
        <ul className="mt-1.5 space-y-0.5 text-red-50 list-disc pl-5 max-h-32 overflow-y-auto">
          {itens.map((t, i) => <li key={i}>{t}</li>)}
        </ul>
      )}
    </div>
  );
}
