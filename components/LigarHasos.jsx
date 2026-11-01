"use client";

import { useEffect, useRef, useState } from "react";
import Icone from "@/components/Icones";

// Botão "Ligar" do Chat pela Hasos (ligação pelo WhatsApp direto no navegador, discador headless).
// Fluxo: lista os números da conta → (com 2+ números conectados, pergunta por qual ligar) → pega o token do discador desse número
// no servidor → carrega o embed.js da Hasos → HasosPhone.create(...).call.start(telefone). A chave de API nunca chega ao navegador.
// Sem chave configurada, chama `fallback` (Wavoip / wa.me).
const EMBED = "https://phone.hasos.com.br/embed.js";
const discadores = {}; // instanceId -> HasosPhone (reaproveita o discador do número)
let carregandoEmbed = null;
let emEvento = () => {}; // quem está ouvindo os eventos do discador (sempre o componente montado mais recente)

function carregarEmbed() {
  if (typeof window === "undefined") return Promise.reject(new Error("sem janela"));
  if (window.HasosPhone) return Promise.resolve();
  if (!carregandoEmbed) {
    carregandoEmbed = new Promise((ok, erro) => {
      const s = document.createElement("script");
      s.src = EMBED;
      s.onload = () => (window.HasosPhone ? ok() : erro(new Error("embed.js carregou sem HasosPhone")));
      s.onerror = () => { carregandoEmbed = null; erro(new Error("Não foi possível carregar o discador da Hasos.")); };
      document.head.appendChild(s);
    });
  }
  return carregandoEmbed;
}

const soDigitos = (v) => String(v || "").replace(/\D/g, "");
const mascara = (p) => {
  const d = soDigitos(p).replace(/^55/, "");
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : p || "";
};
const lerSalvo = () => { try { return localStorage.getItem("hasosInstancia") || ""; } catch { return ""; } };
const gravarSalvo = (v) => { try { localStorage.setItem("hasosInstancia", v); } catch {} };

export default function LigarHasos({ phone, name, fallback, className = "", title = "Ligar pelo WhatsApp" }) {
  const [menu, setMenu] = useState(null); // lista de números conectados para escolher
  const [carregando, setCarregando] = useState(false);
  const [chamada, setChamada] = useState(null); // { estado, nome, numero, msg, desde }
  const [seg, setSeg] = useState(0);
  const phoneRef = useRef(null);
  const fechaRef = useRef(null);

  useEffect(() => {
    if (chamada?.estado !== "conversando") return undefined;
    const t0 = chamada.desde || Date.now();
    const id = setInterval(() => setSeg(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [chamada?.estado, chamada?.desde]);
  useEffect(() => () => clearTimeout(fechaRef.current), []);

  function mostrar(c, fechaEm) {
    clearTimeout(fechaRef.current);
    setChamada(c);
    if (fechaEm) fechaRef.current = setTimeout(() => setChamada(null), fechaEm);
  }

  async function clicar() {
    if (carregando || ["preparando", "chamando", "conversando"].includes(chamada?.estado)) return;
    setCarregando(true);
    try {
      const r = await fetch("/api/hasos/instancias").then((x) => x.json()).catch(() => null);
      if (!r?.configurado) { fallback?.(); return; }
      if (r.erro) { mostrar({ estado: "erro", msg: r.erro }, 6000); return; }
      const conectados = (r.instancias || []).filter((i) => i.status === "CONNECTED");
      if (!conectados.length) {
        mostrar({ estado: "erro", msg: (r.instancias || []).length ? "Nenhum número da Hasos está conectado agora. Reconecte em Dispositivos, no painel da Hasos." : "Nenhum número cadastrado na Hasos ainda. Conecte os números em Dispositivos, no painel da Hasos." }, 8000);
        return;
      }
      if (conectados.length === 1) { await iniciar(conectados[0]); return; }
      const salvo = lerSalvo();
      setMenu([...conectados].sort((a, b) => (a.id === salvo ? -1 : b.id === salvo ? 1 : 0)));
    } finally {
      setCarregando(false);
    }
  }

  async function iniciar(inst) {
    setMenu(null);
    gravarSalvo(inst.id);
    let numero = soDigitos(phone);
    if (numero.length === 10 || numero.length === 11) numero = "55" + numero;
    if (numero.length < 12) { mostrar({ estado: "erro", msg: "Telefone inválido." }, 5000); return; }
    const base = { nome: name || mascara(phone), numero: mascara(phone), de: inst.phone ? mascara(inst.phone) : "" };
    mostrar({ ...base, estado: "preparando" });
    try {
      let d = discadores[inst.id];
      if (!d) {
        const t = await fetch("/api/hasos/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instanceId: inst.id }) }).then((x) => x.json());
        if (!t?.token) throw new Error(t?.error || "Não consegui o token do discador.");
        await carregarEmbed();
        d = window.HasosPhone.create({ token: t.token, allowedOrigin: window.location.origin });
        await d.ready();
        for (const ev of ["call:started", "call:accepted", "call:ended"]) d.on?.(ev, () => emEvento(ev));
        discadores[inst.id] = d;
      }
      phoneRef.current = d;
      emEvento = (ev) => {
        if (ev === "call:started") mostrar({ ...base, estado: "chamando" });
        else if (ev === "call:accepted") { setSeg(0); mostrar({ ...base, estado: "conversando", desde: Date.now() }); }
        else if (ev === "call:ended") mostrar({ ...base, estado: "encerrada" }, 4000);
      };
      mostrar({ ...base, estado: "chamando" });
      await d.call.start(numero);
    } catch (e) {
      delete discadores[inst.id];
      mostrar({ ...base, estado: "erro", msg: e?.message || "Não foi possível ligar." }, 8000);
    }
  }

  async function desligar() {
    try { await phoneRef.current?.call?.hangup(); } catch {}
    mostrar(chamada ? { ...chamada, estado: "encerrada" } : null, 3000);
  }

  const ativa = ["preparando", "chamando", "conversando"].includes(chamada?.estado);
  const tempo = `${String(Math.floor(seg / 60)).padStart(2, "0")}:${String(seg % 60).padStart(2, "0")}`;

  return (
    <>
      <span className="relative hidden md:inline-flex shrink-0">
        <button type="button" onClick={clicar} disabled={carregando || ativa} title={title} className={className}>
          <Icone nome="cobranca" className="w-3 h-3" /> {carregando ? "…" : "Ligar"}
        </button>
        {menu && (
          <>
            <span className="fixed inset-0 z-[60]" onClick={() => setMenu(null)} />
            <span className="absolute right-0 top-full mt-1 z-[61] w-56 rounded-lg border border-slate-200 bg-white shadow-lg py-1">
              <span className="block px-3 py-1 text-[10px] uppercase tracking-wide text-slate-400">Ligar por qual número?</span>
              {menu.map((i, idx) => (
                <button key={i.id} type="button" onClick={() => iniciar(i)} className="block w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-emerald-50">
                  <span className="font-medium">{i.nome || mascara(i.phone) || i.id}</span>
                  {i.nome && i.phone && <span className="text-slate-400"> · {mascara(i.phone)}</span>}
                  {idx === 0 && lerSalvo() === i.id && <span className="ml-1 text-[10px] text-emerald-600">último usado</span>}
                </button>
              ))}
            </span>
          </>
        )}
      </span>

      {chamada && (
        <div className="fixed bottom-4 right-4 z-[70] w-72 rounded-xl border border-slate-200 bg-white shadow-xl p-3 text-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold text-slate-800 truncate">{chamada.nome}</p>
              <p className="text-[11px] text-slate-400 truncate">{chamada.numero}{chamada.de ? ` · por ${chamada.de}` : ""}</p>
            </div>
            {!ativa && <button type="button" onClick={() => setChamada(null)} className="text-slate-300 hover:text-slate-500 text-xs">✕</button>}
          </div>
          <p className={`mt-1.5 text-xs font-medium ${chamada.estado === "erro" ? "text-red-600" : chamada.estado === "conversando" ? "text-emerald-600" : "text-slate-500"}`}>
            {chamada.estado === "preparando" && "Preparando a ligação…"}
            {chamada.estado === "chamando" && "Chamando… (libere o microfone se o navegador pedir)"}
            {chamada.estado === "conversando" && `Em chamada · ${tempo}`}
            {chamada.estado === "encerrada" && "Chamada encerrada"}
            {chamada.estado === "erro" && (chamada.msg || "Não foi possível ligar.")}
          </p>
          {ativa && (
            <button type="button" onClick={desligar} className="mt-2 w-full rounded-lg bg-red-500 text-white text-xs font-medium py-1.5 hover:bg-red-600">Desligar</button>
          )}
        </div>
      )}
    </>
  );
}
