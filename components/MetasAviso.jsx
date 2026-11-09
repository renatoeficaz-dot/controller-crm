"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { tocarAlerta } from "@/lib/somAlerta";
import Icone from "@/components/Icones";
import { avisosDoMomento, juntarAlertas, legendaDaBarra, metricasDe, money } from "@/lib/metasAviso";

const TICK = 60 * 1000; // a cada 1 min busca os números e confere o que há para avisar
const A_CADA = 30 * 60 * 1000; // o cartão abre sozinho de 30 em 30 minutos, até todas as metas serem batidas
const RECOLHE_APOS = 45 * 1000; // aberto sozinho, o cartão volta a ser a pílula depois deste tempo
const SOME_COMEMORACAO = 15 * 1000; // o aviso verde de "bateu" some sozinho
const LS_ULTIMO = "metasAviso_ultimo";
const LS_LIMIARES = "metasAviso_limiares";
const LS_NIVEIS = "metasAviso_niveis";
const LS_OK_OCULTO = "metasAviso_okOculto";
const SOME_ALERTA_CELULAR = 8 * 1000; // no celular os avisos somem sozinhos
const ehCelular = () => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;

// Mesmas cores da tela de Metas: vermelho = abaixo da mínima, âmbar = mínima, azul = média, verde = meta cheia.
const COR_BARRA = { abaixo: "bg-red-500", minima: "bg-amber-500", media: "bg-sky-500", meta: "bg-emerald-500" };
const COR_FALTA = { minima: "text-amber-600", media: "text-sky-600", meta: "text-emerald-600" };
// O "falta pouco" ganha a cor do nível que está para ser batido.
const ESTILO_ALERTA = {
  minima: { caixa: "border-amber-300 bg-amber-50 text-amber-700", valor: "text-amber-600" },
  media: { caixa: "border-sky-300 bg-sky-50 text-sky-700", valor: "text-sky-600" },
  meta: { caixa: "border-emerald-300 bg-emerald-50 text-emerald-700", valor: "text-emerald-600" },
};

function lerLS(chave, padrao) {
  try { return JSON.parse(localStorage.getItem(chave)) ?? padrao; } catch { return padrao; }
}
function gravarLS(chave, valor) {
  try { localStorage.setItem(chave, JSON.stringify(valor)); } catch {}
}

function Barra({ m }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-semibold text-slate-700">{m.titulo}</span>
        {m.prox
          ? <span className={`text-[13px] font-semibold ${COR_FALTA[m.prox.chave]}`}>faltam {money(m.prox.faltam)}</span>
          : <span className="text-[13px] font-semibold text-emerald-600">meta cheia!</span>}
      </div>
      <div className="relative h-2 rounded-full bg-slate-200 mt-1.5 mb-1">
        <div className={`h-2 rounded-full ${COR_BARRA[m.nivel] || COR_BARRA.abaixo}`} style={{ width: `${m.pct}%` }} />
        {m.marcos.map((p, i) => <div key={i} className="absolute -top-0.5 -bottom-0.5 w-0.5 bg-slate-400" style={{ left: `${p}%` }} />)}
      </div>
      <p className="text-[11px] text-slate-500">{legendaDaBarra(m)}</p>
    </div>
  );
}

// Avisos de metas no canto inferior esquerdo (só para o Arthur).
//  • Pílula: o resumo sempre à vista, numa linha — quanto falta para a próxima meta de cada métrica e uma barrinha. Clicar abre o cartão.
//  • Cartão: de 30 em 30 minutos abre sozinho (e volta a ser pílula em 45 s) com as barras, os traços da mínima/média e o que falta.
//  • "Falta pouco": faltando 50%, 30%, 10% e 5% da meta perseguida, na cor do nível que está para ser batido, com bipe.
//  • "Bateu": aviso verde, com bipe, quando um nível é batido (mínima, média, meta cheia).
// Tudo em R$. Regras e textos em lib/metasAviso.js (testadas).
export default function MetasAviso() {
  const [alvo, setAlvo] = useState(false);
  const [dados, setDados] = useState(null); // { ms, dia, hora } do último resumo
  const [aberto, setAberto] = useState(false);
  const [alertas, setAlertas] = useState([]);
  const [okOcultoDia, setOkOcultoDia] = useState(null); // dia em que o usuário fechou a pílula verde
  const ocupado = useRef(false);
  const manual = useRef(false); // aberto por clique: não recolhe sozinho
  const diaAtual = useRef(null); // dia do último resumo: na virada, os avisos de ontem saem da tela

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
    setOkOcultoDia(lerLS(LS_OK_OCULTO, null));

    async function tick(forcarPeriodico = false) {
      if (ocupado.current || cancelado) return;
      ocupado.current = true;
      try {
        const r = await fetch("/api/metas/resumo?leve=1").then((x) => (x.ok ? x.json() : null)).catch(() => null);
        if (!r || r.error || cancelado) return;
        const agora = Date.now();
        const ms = metricasDe(r);
        const visivel = !document.hidden;
        if (diaAtual.current && diaAtual.current !== r.dia) setAlertas([]);
        diaAtual.current = r.dia;
        setDados({ ms, dia: r.dia, hora: new Date() });

        // "Falta pouco" e "bateu": decididos em lib/metasAviso.js; aqui só se grava o que já foi avisado e se mostra.
        const res = avisosDoMomento({ ms, dia: r.dia, feitos: lerLS(LS_LIMIARES, null), niveisVistos: lerLS(LS_NIVEIS, null), visivel, agora });
        gravarLS(LS_LIMIARES, res.feitos);
        gravarLS(LS_NIVEIS, res.niveisVistos);
        if (res.alertas.length) {
          setAlertas((a) => juntarAlertas(a, res.alertas));
          tocarAlerta();
          const celular = ehCelular();
          for (const a of res.alertas) {
            if (a.tipo === "bateu") setTimeout(() => setAlertas((x) => x.filter((i) => i.id !== a.id)), SOME_COMEMORACAO);
            else if (celular) setTimeout(() => setAlertas((x) => x.filter((i) => i.id !== a.id)), SOME_ALERTA_CELULAR);
          }
        }

        // Cartão aberto de 30 em 30 minutos, até bater todas.
        const venceu = forcarPeriodico || agora - Number(lerLS(LS_ULTIMO, 0)) >= A_CADA;
        if (venceu && visivel && !ehCelular() && ms.some((m) => m.prox)) {
          manual.current = false;
          setAberto(true);
          gravarLS(LS_ULTIMO, agora);
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

  // Aberto sozinho, o cartão volta a ser pílula; aberto por clique, fica até o usuário recolher.
  useEffect(() => {
    if (!aberto || manual.current) return;
    const t = setTimeout(() => setAberto(false), RECOLHE_APOS);
    return () => clearTimeout(t);
  }, [aberto]);

  if (!alvo || !dados) return null;
  const { ms, hora } = dados;
  const temMeta = ms.length > 0; // dia sem meta (domingo sem parcelas a vencer): não há o que perseguir
  const tudoBatido = temMeta && ms.every((m) => !m.prox);
  const okOculto = okOcultoDia === dados.dia;
  const mostraResumo = temMeta && !(tudoBatido && !aberto && okOculto);
  if (!alertas.length && !mostraResumo) return null;

  const abrir = () => { manual.current = true; setAberto(true); };
  const fechar = (id) => setAlertas((x) => x.filter((i) => i.id !== id));
  const ocultarOk = () => { setOkOcultoDia(dados.dia); gravarLS(LS_OK_OCULTO, dados.dia); };
  const horaTxt = hora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="fixed bottom-4 left-4 z-[80] flex flex-col items-start gap-2 w-[min(22rem,calc(100vw-2rem))]">
      {alertas.map((a) => (a.tipo === "bateu" ? (
        <div key={a.id} role="status" className="w-full rounded-xl shadow-lg border border-emerald-300 bg-emerald-50 text-emerald-700 px-3 py-2.5 flex items-start gap-2.5">
          <span className="w-7 h-7 shrink-0 rounded-full bg-emerald-500 text-white flex items-center justify-center"><Icone nome="trofeu" className="w-4 h-4" /></span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">{a.titulo} bateu {a.nomeNivel}</p>
            <p className="text-xs mt-0.5">{a.detalhe}</p>
          </div>
          <button onClick={() => fechar(a.id)} className="text-lg leading-none opacity-60 hover:opacity-100" aria-label="Fechar">×</button>
        </div>
      ) : (
        <div key={a.id} role="status" className={`w-full rounded-xl shadow-lg border px-3 py-2.5 ${(ESTILO_ALERTA[a.alvoChave] || ESTILO_ALERTA.minima).caixa}`}>
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[13px] font-semibold">{a.titulo} · quase {a.quase}</p>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-lg font-semibold ${(ESTILO_ALERTA[a.alvoChave] || ESTILO_ALERTA.minima).valor}`}>{money(a.faltam)}</span>
              <button onClick={() => fechar(a.id)} className="text-lg leading-none opacity-60 hover:opacity-100" aria-label="Fechar">×</button>
            </div>
          </div>
          <div className="h-1.5 rounded-full bg-slate-200 mt-1.5">
            <div className={`h-1.5 rounded-full ${COR_BARRA[a.alvoChave] || COR_BARRA.minima}`} style={{ width: `${a.avanco}%` }} />
          </div>
          <p className="text-[11px] mt-1">faltam {a.pctFalta}% · {money(a.atual)} de {money(a.alvo)}{a.vendas ? ` · ${a.vendas}` : ""}</p>
        </div>
      )))}

      {temMeta && aberto && (
        <div className="w-full rounded-xl shadow-lg border border-slate-200 bg-white text-slate-700 px-3.5 py-3">
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-xs font-semibold text-slate-500">Metas de hoje · {horaTxt}</p>
            <button onClick={() => setAberto(false)} className="text-slate-400 hover:text-slate-600 text-lg leading-none" aria-label="Recolher">×</button>
          </div>
          <div className="space-y-3">{ms.map((m) => <Barra key={m.id} m={m} />)}</div>
          <p className="text-[11px] text-slate-400 mt-2.5">Abre sozinho a cada 30 minutos até bater todas as metas.</p>
        </div>
      )}

      {temMeta && !aberto && (tudoBatido ? (
        !okOculto && (
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-emerald-50 text-emerald-700 shadow-lg px-3.5 py-2 text-[13px] font-semibold">
            <button onClick={abrir} className="inline-flex items-center gap-2" title="Ver as metas de hoje"><Icone nome="trofeu" className="w-4 h-4" />Todas as metas batidas</button>
            <button onClick={ocultarOk} className="text-lg leading-none opacity-60 hover:opacity-100" aria-label="Fechar">×</button>
          </div>
        )
      ) : (
        <button type="button" onClick={abrir} aria-expanded="false" title="Ver as metas de hoje" className="md:hidden inline-flex items-center justify-center w-9 h-9 rounded-full border border-slate-200 bg-white text-slate-500 shadow-md opacity-80"><Icone nome="trofeu" className="w-4 h-4" /></button>
      ))}
      {temMeta && !aberto && !tudoBatido && (
        <button type="button" onClick={abrir} aria-expanded="false" title="Ver as metas de hoje" className="hidden md:inline-flex items-center gap-3 rounded-full border border-slate-200 bg-white text-slate-700 shadow-lg px-3.5 py-2 text-left hover:border-slate-300">
          {ms.map((m, i) => (
            <Fragment key={m.id}>
              {i > 0 && <span className="w-px h-6 bg-slate-200" />}
              <span className="block w-[104px]">
                <span className="flex items-baseline justify-between gap-1.5">
                  <span className="text-[11px] text-slate-500">{m.curto}</span>
                  {m.prox
                    ? <span className={`text-xs font-semibold ${COR_FALTA[m.prox.chave]}`}>−{money(m.prox.faltam)}</span>
                    : <span className="text-xs font-semibold text-emerald-600">✓</span>}
                </span>
                <span className="block h-[3px] rounded-full bg-slate-200 mt-1">
                  <span className={`block h-[3px] rounded-full ${COR_BARRA[m.nivel] || COR_BARRA.abaixo}`} style={{ width: `${m.pct}%` }} />
                </span>
              </span>
            </Fragment>
          ))}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-slate-400"><polyline points="18 15 12 9 6 15" /></svg>
        </button>
      )}
    </div>
  );
}
