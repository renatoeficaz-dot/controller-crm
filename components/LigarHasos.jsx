"use client";

import { useEffect, useRef, useState } from "react";
import Icone from "@/components/Icones";
import { obterDiscador, esquecerDiscador } from "@/lib/hasosDiscador";

// Botão "Ligar" do Chat pela Hasos (ligação pelo WhatsApp direto no navegador, discador headless).
// Fluxo: lista os números liberados e conectados → quadradinhos para escolher por qual número ligar → pega o token do discador
// desse número no servidor → HasosPhone.create(...).call.start(telefone). A chave de API nunca chega ao navegador.
// Sem chave configurada, chama `fallback` (Wavoip / wa.me). Chamadas RECEBIDAS ficam em components/ChamadasHasos.jsx.
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
  const [chamada, setChamada] = useState(null); // { estado, nome, numero, de, msg, desde }
  const [seg, setSeg] = useState(0);
  const phoneRef = useRef(null);
  const fechaRef = useRef(null);
  const baseRef = useRef(null); // dados da ligação que ESTE botão iniciou (os eventos de chamadas recebidas não mexem no painel)

  function mostrar(c, fechaEm) {
    clearTimeout(fechaRef.current);
    setChamada(c);
    if (fechaEm) fechaRef.current = setTimeout(() => setChamada(null), fechaEm);
  }

  useEffect(() => {
    function aoEvento(e) {
      const { ev } = e.detail || {};
      const base = baseRef.current;
      if (!base) return;
      if (ev === "call:started") mostrar({ ...base, estado: "chamando" });
      else if (ev === "call:accepted") { setSeg(0); mostrar({ ...base, estado: "conversando", desde: Date.now() }); }
      else if (ev === "call:ended") { baseRef.current = null; mostrar({ ...base, estado: "encerrada" }, 4000); }
    }
    window.addEventListener("hasos:ev", aoEvento);
    return () => { window.removeEventListener("hasos:ev", aoEvento); clearTimeout(fechaRef.current); };
  }, []);

  useEffect(() => {
    if (chamada?.estado !== "conversando") return undefined;
    const t0 = chamada.desde || Date.now();
    const id = setInterval(() => setSeg(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [chamada?.estado, chamada?.desde]);

  async function clicar() {
    if (carregando || ["preparando", "chamando", "conversando"].includes(chamada?.estado)) return;
    setCarregando(true);
    try {
      const r = await fetch("/api/hasos/instancias").then((x) => x.json()).catch(() => null);
      if (!r?.configurado) { fallback?.(); return; }
      if (r.erro) { mostrar({ estado: "erro", msg: r.erro }, 6000); return; }
      const conectados = (r.instancias || []).filter((i) => i.status === "CONNECTED");
      if (!conectados.length) {
        mostrar({ estado: "erro", msg: (r.instancias || []).length ? "Nenhum número liberado para você está conectado agora. Reconecte em Dispositivos, no painel da Hasos." : "Nenhum número liberado para você ligar. Peça ao administrador (Configurações → Usuários) ou conecte os números na Hasos." }, 8000);
        return;
      }
      // Sempre pergunta por qual número ligar (quadradinhos), mesmo com um só conectado.
      setMenu(conectados);
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
    const base = {
      nome: name || mascara(phone),
      numero: mascara(phone),
      de: inst.nome ? `${inst.nome}${inst.phone ? " " + mascara(inst.phone) : ""}` : inst.phone ? mascara(inst.phone) : "",
    };
    baseRef.current = base;
    mostrar({ ...base, estado: "preparando" });
    try {
      const d = await obterDiscador(inst);
      phoneRef.current = d;
      mostrar({ ...base, estado: "chamando" });
      // O discador NÃO rejeita quando falha: devolve { call: null, err: { message } } (ex.: "Assine o Pro para ligar.").
      const r = await d.call.start(numero);
      if (r?.err || r?.call === null) {
        baseRef.current = null;
        mostrar({ ...base, estado: "erro", msg: r?.err?.message || "A Hasos não iniciou a ligação." }, 12000);
      }
    } catch (e) {
      esquecerDiscador(inst.id);
      baseRef.current = null;
      mostrar({ ...base, estado: "erro", msg: e?.message || "Não foi possível ligar." }, 8000);
    }
  }

  async function desligar() {
    try { await phoneRef.current?.call?.hangup(); } catch {}
    baseRef.current = null;
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
            <span className="fixed inset-0 z-[60] bg-black/20" onClick={() => setMenu(null)} />
            <span className="fixed z-[61] left-1/2 top-1/3 -translate-x-1/2 w-[min(92vw,26rem)] rounded-2xl border border-slate-200 bg-white shadow-2xl p-4">
              <span className="block text-sm font-semibold text-slate-800">Ligar para {name || mascara(phone)}</span>
              <span className="block text-[11px] text-slate-400 mb-3">Por qual número você quer ligar?</span>
              <span className="grid grid-cols-2 gap-2.5">
                {menu.map((i) => {
                  const ultimo = lerSalvo() === i.id;
                  return (
                    <button
                      key={i.id}
                      type="button"
                      onClick={() => iniciar(i)}
                      className={`aspect-[4/3] rounded-xl border-2 p-2.5 text-left flex flex-col justify-between transition-colors hover:border-emerald-500 hover:bg-emerald-50 ${ultimo ? "border-emerald-400 bg-emerald-50/60" : "border-slate-200 bg-white"}`}
                    >
                      <span className="flex items-center gap-1.5 text-[10px] text-emerald-600"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> conectado{ultimo ? " · último usado" : ""}</span>
                      <span>
                        <span className="block text-sm font-semibold text-slate-800 leading-tight">{i.nome || "Sem nome"}</span>
                        <span className="block text-[11px] text-slate-500">{i.phone ? mascara(i.phone) : i.id}</span>
                      </span>
                    </button>
                  );
                })}
              </span>
              <button type="button" onClick={() => setMenu(null)} className="mt-3 w-full text-xs text-slate-400 hover:text-slate-600">Cancelar</button>
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
