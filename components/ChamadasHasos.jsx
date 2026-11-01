"use client";

import { useEffect, useRef, useState } from "react";
import { obterDiscador, discadorDe } from "@/lib/hasosDiscador";

// Receptor global das ligações RECEBIDAS pela Hasos (fica montado no app inteiro, ver app/layout.js). O discador headless só
// toca — sem esta tela ninguém vê quem está ligando nem consegue atender ou recusar. Conecta os números liberados para o usuário
// e mostra: quem liga (nome do lead pelo telefone), por qual número, e os botões Atender / Recusar / Desligar.
const soDigitos = (v) => String(v || "").replace(/\D/g, "");
const mascara = (p) => {
  const d = soDigitos(p).replace(/^55/, "");
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : p || "";
};
const idDaOferta = (o) => o?.id ?? o?.offerId ?? o?.callId ?? null;
const telDaOferta = (o) => {
  const bruto = o?.peer?.phone ?? o?.peer?.id ?? o?.peerPhone ?? o?.phone ?? o?.from ?? o?.caller ?? "";
  return soDigitos(String(bruto).split("@")[0]);
};

export default function ChamadasHasos() {
  const [oferta, setOferta] = useState(null); // { id, instId, phone, nome, de, estado: "tocando" | "conversando" | "encerrada", desde }
  const [seg, setSeg] = useState(0);
  const ref = useRef(null);
  const instRef = useRef({}); // instId -> { nome, phone }
  ref.current = oferta;

  // Conecta (e reconecta de tempos em tempos) os discadores dos números liberados.
  useEffect(() => {
    let vivo = true;
    async function conectar() {
      const r = await fetch("/api/hasos/instancias", { cache: "no-store" }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
      if (!vivo || !r?.configurado) return;
      for (const i of (r.instancias || []).filter((x) => x.status === "CONNECTED")) {
        instRef.current[i.id] = i;
        if (!discadorDe(i.id)) await obterDiscador(i).catch(() => {});
      }
    }
    conectar();
    const t = setInterval(conectar, 3 * 60 * 1000);
    return () => { vivo = false; clearInterval(t); };
  }, []);

  useEffect(() => {
    async function aoEvento(e) {
      const { ev, payload, instId } = e.detail || {};
      if (ev === "offer:received") {
        console.info("[hasos] chamada recebida:", payload);
        const phone = telDaOferta(payload);
        const inst = instRef.current[instId];
        const base = { id: idDaOferta(payload), instId, phone, nome: phone ? mascara(phone) : "Chamada recebida…", de: inst ? `${inst.nome || ""} ${inst.phone ? mascara(inst.phone) : ""}`.trim() : "", estado: "tocando" };
        setOferta(base);
        // O discador não diz QUEM liga: o telefone vem do histórico de chamadas da Hasos (pode levar um instante pra aparecer).
        for (let i = 0; i < 4 && !base.phone; i++) {
          const c = await fetch(`/api/hasos/chamada?id=${encodeURIComponent(base.id)}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
          if (c?.chamada?.peerPhone) { base.phone = soDigitos(c.chamada.peerPhone); break; }
          await new Promise((r) => setTimeout(r, 700));
        }
        if (base.phone) {
          setOferta((o) => (o && o.id === base.id ? { ...o, phone: base.phone, nome: mascara(base.phone) } : o));
          const q = await fetch(`/api/hasos/quem?phone=${base.phone}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
          if (q?.contato) setOferta((o) => (o && o.id === base.id ? { ...o, nome: q.contato.name, contatoId: q.contato.id } : o));
        }
      } else if (ev === "call:accepted" && ref.current?.estado === "tocando") {
        setSeg(0);
        setOferta((o) => (o ? { ...o, estado: "conversando", desde: Date.now() } : o));
      } else if (ev === "call:ended" && ref.current) {
        setOferta((o) => (o ? { ...o, estado: "encerrada" } : o));
        setTimeout(() => setOferta((o) => (o?.estado === "encerrada" ? null : o)), 3500);
      }
    }
    window.addEventListener("hasos:ev", aoEvento);
    return () => window.removeEventListener("hasos:ev", aoEvento);
  }, []);

  // A Hasos costuma marcar a chamada como ENCERRADA ("uncallable") menos de 1s depois de chegar, mas o WhatsApp pode seguir tocando
  // e o discador ainda tem a oferta: por isso o aviso NÃO fecha pelo status do histórico. Fica 60s (ou até o discador encerrar/recusar)
  // para dar tempo de tentar Atender; se a tentativa falhar, o erro aparece no próprio aviso.
  useEffect(() => {
    if (oferta?.estado !== "tocando") return undefined;
    const t = setTimeout(() => setOferta((o) => (o && o.id === oferta.id && o.estado === "tocando" ? null : o)), 60000);
    return () => clearTimeout(t);
  }, [oferta?.estado, oferta?.id]);

  useEffect(() => {
    if (oferta?.estado !== "conversando") return undefined;
    const t0 = oferta.desde || Date.now();
    const t = setInterval(() => setSeg(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(t);
  }, [oferta?.estado, oferta?.desde]);

  if (!oferta) return null;
  const d = discadorDe(oferta.instId);
  const tempo = `${String(Math.floor(seg / 60)).padStart(2, "0")}:${String(seg % 60).padStart(2, "0")}`;

  return (
    <div className="fixed top-4 right-4 z-[80] w-72 rounded-xl border-2 border-emerald-400 bg-white shadow-2xl p-3 text-sm">
      <p className="text-[10px] uppercase tracking-wide text-emerald-600 font-semibold">
        {oferta.estado === "tocando" ? "Chamada recebida" : oferta.estado === "conversando" ? "Em chamada" : oferta.estado === "perdida" ? `Chamada perdida${oferta.motivo || ""}` : "Chamada encerrada"}
      </p>
      <p className="font-semibold text-slate-800 truncate">{oferta.nome}</p>
      <p className="text-[11px] text-slate-400 truncate">{oferta.phone ? mascara(oferta.phone) : ""}{oferta.de ? ` · para ${oferta.de}` : ""}</p>
      {oferta.estado === "conversando" && <p className="mt-1 text-xs font-medium text-emerald-600">{tempo}</p>}
      {oferta.erro && <p className="mt-1 text-xs font-medium text-red-600">{oferta.erro}</p>}
      {oferta.estado === "tocando" && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button type="button" onClick={async () => {
            try {
              // O id guardado do aviso pode não ser o da oferta no discador ("no such offer"): pergunta ao discador o que está tocando agora.
              let alvo = oferta.id;
              try {
                const res = await d?.call?.getOffers?.();
                const lista = Array.isArray(res) ? res : Array.isArray(res?.offers) ? res.offers : [];
                console.info("[hasos] ofertas ativas:", res);
                const ids = lista.map((x) => (typeof x === "string" ? x : idDaOferta(x))).filter(Boolean);
                if (!ids.length) { setOferta((o) => (o ? { ...o, erro: "Essa chamada já terminou no WhatsApp (quem ligou desistiu ou ela foi atendida em outro lugar)." } : o)); return; }
                if (!ids.includes(alvo)) alvo = ids[ids.length - 1];
              } catch {}
              const r = await d?.call?.accept(alvo);
              console.info("[hasos] atender:", r);
              if (r?.err || r?.call === null) {
                const e = r?.err || {};
                const det = e.message || e.code || (Object.keys(e).length ? JSON.stringify(e) : JSON.stringify(r));
                setOferta((o) => (o ? { ...o, erro: "Não foi possível atender: " + det } : o));
              }
            } catch (e) { setOferta((o) => (o ? { ...o, erro: "Não foi possível atender: " + (e?.message || e?.code || String(e)) } : o)); }
          }} className="rounded-lg bg-emerald-500 text-white text-xs font-medium py-1.5 hover:bg-emerald-600">Atender</button>
          <button type="button" onClick={async () => { try { await d?.call?.reject(oferta.id); } catch {} setOferta(null); }} className="rounded-lg bg-red-500 text-white text-xs font-medium py-1.5 hover:bg-red-600">Recusar</button>
        </div>
      )}
      {oferta.estado === "conversando" && (
        <button type="button" onClick={async () => { try { await d?.call?.hangup(); } catch {} setOferta(null); }} className="mt-2 w-full rounded-lg bg-red-500 text-white text-xs font-medium py-1.5 hover:bg-red-600">Desligar</button>
      )}
    </div>
  );
}
