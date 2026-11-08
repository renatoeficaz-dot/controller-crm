"use client";

import { useEffect, useRef, useState } from "react";
import { tocarAlerta } from "@/lib/somAlerta";

const TICK = 60 * 1000; // confere a cada 1 min o que está vencido
const A_CADA = 30 * 60 * 1000; // aviso periódico: de 30 em 30 minutos
const ATUALIZA = 5 * 60 * 1000; // dados das metas: de 5 em 5 minutos (para pegar os "faltam X%")
const LIMIARES = [50, 30, 10, 5]; // avisa quando faltar este % da meta que está sendo perseguida (mostrado em R$)
const VALOR_VENDA = 300;
const LS_ULTIMO = "metasAviso_ultimo";
const LS_LIMIARES = "metasAviso_limiares";
const NIVEIS = [
  { chave: "minima", nome: "a mínima" },
  { chave: "media", nome: "a média" },
  { chave: "meta", nome: "a meta cheia" },
];

const money = (n) => "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function lerLS(chave, padrao) {
  try { return JSON.parse(localStorage.getItem(chave)) ?? padrao; } catch { return padrao; }
}

// Próxima meta ainda não batida de uma métrica (mínima → média → meta cheia). null = bateu todas.
function proximaMeta(atual, metas) {
  for (const n of NIVEIS) {
    const alvo = Number(metas[n.chave]) || 0;
    if (alvo > 0 && atual < alvo) return { ...n, alvo, faltam: Math.round((alvo - atual) * 100) / 100 };
  }
  return null;
}

function metricas(r) {
  return [
    { id: "receb", titulo: "Recebimentos", atual: r.recebimentosHoje || 0, metas: { minima: r.metaRecebimentosMinima, media: r.metaRecebimentosMedia, meta: r.metaRecebimentosDia } },
    { id: "lib", titulo: "Liberação", atual: r.liberadoHoje || 0, metas: { minima: r.metaLiberacaoMinima, media: r.metaLiberacaoMedia, meta: r.metaLiberacaoDia }, porVenda: VALOR_VENDA },
  ]
    // Dia sem meta (domingo, sem parcelas a vencer): não há o que perseguir — antes saía "todas as metas batidas" sem nenhuma meta.
    .filter((m) => [m.metas.minima, m.metas.media, m.metas.meta].some((v) => Number(v) > 0))
    .map((m) => ({ ...m, prox: proximaMeta(m.atual, m.metas) }));
}

function textoFaltam(m) {
  if (!m.prox) return `${m.titulo}: todas as metas batidas`;
  const vendas = m.porVenda ? ` (≈ ${Math.ceil(m.prox.faltam / m.porVenda)} venda${Math.ceil(m.prox.faltam / m.porVenda) === 1 ? "" : "s"} de ${money(m.porVenda)})` : "";
  return `${m.titulo}: faltam ${money(m.prox.faltam)} para ${m.prox.nome}${vendas}`;
}

// Avisos de metas no canto inferior esquerdo (só para o Arthur): de 30 em 30 minutos mostra quanto falta para a próxima meta de cada
// métrica, até todas serem batidas; e avisa também quando faltar 50%, 30%, 10% e 5% da meta que está sendo perseguida — sempre em R$.
export default function MetasAviso() {
  const [alvo, setAlvo] = useState(false);
  const [periodico, setPeriodico] = useState(null); // { linhas: [...], hora }
  const [alertas, setAlertas] = useState([]); // [{ id, texto }]
  const ultimoDado = useRef({ t: 0, r: null });
  const ocupado = useRef(false);

  useEffect(() => {
    let cancelado = false;
    fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)).then((u) => {
      if (!cancelado && u?.name && /arthur/i.test(u.name)) setAlvo(true);
    }).catch(() => {});
    return () => { cancelado = true; };
  }, []);

  useEffect(() => {
    if (!alvo) return;
    let cancelado = false;

    async function buscar() {
      const agora = Date.now();
      if (ultimoDado.current.r && agora - ultimoDado.current.t < ATUALIZA - 1000) return ultimoDado.current.r;
      const r = await fetch("/api/metas/resumo?leve=1").then((x) => (x.ok ? x.json() : null)).catch(() => null);
      if (r && !r.error) ultimoDado.current = { t: agora, r };
      return ultimoDado.current.r;
    }

    async function tick(forcarPeriodico = false) {
      if (ocupado.current || cancelado) return;
      ocupado.current = true;
      try {
        const agora = Date.now();
        const venceuPeriodico = forcarPeriodico || agora - Number(lerLS(LS_ULTIMO, 0)) >= A_CADA;
        const r = await buscar();
        if (!r || cancelado) return;
        const ms = metricas(r);

        // 1) Limiares: faltam 50% / 30% / 10% / 5% da meta perseguida (a menor faixa cruzada vale; cada uma só avisa uma vez por dia).
        const feitos = lerLS(LS_LIMIARES, { dia: r.dia, chaves: [] });
        const chaves = new Set(feitos.dia === r.dia ? feitos.chaves : []);
        const novos = [];
        for (const m of ms) {
          if (!m.prox) continue;
          const pctFalta = (m.prox.faltam / m.prox.alvo) * 100;
          const cruzados = LIMIARES.filter((l) => pctFalta <= l);
          if (!cruzados.length) continue;
          const menor = Math.min(...cruzados);
          const marcar = cruzados.map((l) => `${m.id}:${m.prox.chave}:${l}`);
          if (marcar.every((k) => chaves.has(k))) continue;
          marcar.forEach((k) => chaves.add(k));
          if (!marcar.includes(`${m.id}:${m.prox.chave}:${menor}`)) continue;
          novos.push({ id: `${m.id}-${m.prox.chave}-${menor}-${agora}`, texto: `Falta pouco! ${textoFaltam(m)}` });
        }
        try { localStorage.setItem(LS_LIMIARES, JSON.stringify({ dia: r.dia, chaves: [...chaves] })); } catch {}
        if (novos.length && !document.hidden) {
          setAlertas((a) => [...a, ...novos]);
          tocarAlerta();
        }

        // 2) Aviso periódico: de 30 em 30 min, até bater todas.
        if (venceuPeriodico && !document.hidden) {
          const pendentes = ms.filter((m) => m.prox);
          if (!pendentes.length) { setPeriodico(null); return; }
          setPeriodico({ linhas: ms.map(textoFaltam), hora: new Date() });
          try { localStorage.setItem(LS_ULTIMO, String(agora)); } catch {}
        }
      } finally {
        ocupado.current = false;
      }
    }

    tick();
    const t = setInterval(() => tick(), TICK);
    const onVisivel = () => { if (!document.hidden) tick(); };
    document.addEventListener("visibilitychange", onVisivel);
    return () => { cancelado = true; clearInterval(t); document.removeEventListener("visibilitychange", onVisivel); };
  }, [alvo]);

  if (!alvo || (!periodico && !alertas.length)) return null;
  const hora = periodico?.hora?.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="fixed bottom-4 left-4 z-[80] flex flex-col gap-2 w-[min(22rem,calc(100vw-2rem))]">
      {alertas.map((a) => (
        <div key={a.id} className="rounded-xl shadow-lg border border-amber-300 bg-amber-50 text-amber-900 px-3.5 py-2.5 flex items-start gap-2">
          <p className="flex-1 text-sm font-medium">{a.texto}</p>
          <button onClick={() => setAlertas((x) => x.filter((i) => i.id !== a.id))} className="text-amber-700 hover:text-amber-900 text-lg leading-none" aria-label="Fechar">×</button>
        </div>
      ))}
      {periodico && (
        <div className="rounded-xl shadow-lg border border-slate-200 bg-white text-slate-700 px-3.5 py-3">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-semibold text-slate-500">Metas de hoje · {hora}</p>
            <button onClick={() => setPeriodico(null)} className="text-slate-400 hover:text-slate-600 text-lg leading-none" aria-label="Fechar">×</button>
          </div>
          <ul className="space-y-1">
            {periodico.linhas.map((l) => <li key={l} className="text-sm">{l}</li>)}
          </ul>
          <p className="text-[11px] text-slate-400 mt-2">Aparece a cada 30 minutos até bater todas as metas.</p>
        </div>
      )}
    </div>
  );
}
