"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { gerarParcelas, resumoCobranca, NUM_PARCELAS } from "@/lib/finance";
import { limiteEscalonado } from "@/lib/escalonamento";

const money = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDia = (iso) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit" });

// Renovação rápida: informa o valor (e a data de pagamento), vê as parcelas que serão geradas e confirma.
// Usa a mesma rota da renovação da ficha (/api/contacts/[id]/renovar): novo ciclo, parcelas novas e o lead volta pra "Liberação pagamento".
export default function RenovacaoRapida({ contactId, nome, onClose, onDone }) {
  const [honorariosPct, setHonorariosPct] = useState(30);
  const [escalCfg, setEscalCfg] = useState(null);
  const [ciclo, setCiclo] = useState(1);
  const [abertas, setAbertas] = useState(0);
  const [valor, setValor] = useState("");
  const [data, setData] = useState(new Date().toLocaleDateString("sv-SE"));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [montado, setMontado] = useState(false);

  useEffect(() => {
    setMontado(true);
    let vivo = true;
    Promise.all([
      fetch("/api/config").then((r) => r.json()).catch(() => null),
      fetch(`/api/contacts/${contactId}`).then((r) => r.json()).catch(() => null),
    ]).then(([cfg, c]) => {
      if (!vivo) return;
      if (cfg?.honorariosPct != null) setHonorariosPct(cfg.honorariosPct);
      setEscalCfg(cfg?.escalonamentoAtivo ? cfg : null);
      if (c) {
        const cicloAtual = c.cicloAtual || 1;
        setCiclo(cicloAtual);
        setAbertas((c.parcelas || []).filter((p) => (p.ciclo || 1) === cicloAtual && !p.renegociada && !p.paid).length);
      }
    });
    return () => { vivo = false; };
  }, [contactId]);

  const limite = escalCfg ? limiteEscalonado(ciclo + 1, escalCfg) : null;
  const capital = Number(valor) || 0;
  const resumo = resumoCobranca(capital, honorariosPct);
  let parcelas = [];
  try { parcelas = capital > 0 && data ? gerarParcelas(capital, honorariosPct, data) : []; } catch { parcelas = []; }

  async function confirmar(e) {
    e.preventDefault();
    if (!capital || !data) { setErro("Informe o valor e a data de pagamento."); return; }
    setSalvando(true);
    setErro("");
    const res = await fetch(`/api/contacts/${contactId}/renovar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ valorCapital: capital, pagamentoCapital: data }),
    });
    setSalvando(false);
    if (!res.ok) {
      setErro((await res.json().catch(() => ({}))).error || "Erro ao renovar.");
      return;
    }
    onDone?.();
    onClose?.();
  }

  if (!montado) return null;
  return createPortal(
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <form onSubmit={confirmar} onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold text-slate-800">Renovação rápida</h3>
            <p className="text-xs text-slate-400 truncate">{nome} · ciclo {ciclo} → {ciclo + 1}</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        {abertas > 0 && (
          <p className="text-xs bg-amber-50 border border-amber-200 text-amber-700 rounded-lg px-2.5 py-1.5">
            Há {abertas} parcela(s) em aberto no ciclo atual — só dá para renovar com o ciclo quitado.
          </p>
        )}

        <label className="block">
          <span className="text-xs text-slate-500">Valor do novo capital (R$)</span>
          <input
            type="number" min="0" step="0.01" autoFocus value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="0,00"
            className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400"
          />
          {limite != null && (
            <button type="button" onClick={() => setValor(String(limite))} className="text-[11px] text-emerald-600 hover:underline mt-0.5">
              usar o limite do ciclo {ciclo + 1}: {money(limite)}
            </button>
          )}
        </label>
        <label className="block">
          <span className="text-xs text-slate-500">Data de pagamento do capital</span>
          <input
            type="date" value={data} onChange={(e) => setData(e.target.value)}
            className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400"
          />
        </label>

        {capital > 0 && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-600 space-y-1">
            <p>
              {NUM_PARCELAS}x de <strong>{money(resumo.valorParcela)}</strong> · total {money(resumo.total)}
              <span className="text-slate-400"> (capital + {honorariosPct}%)</span>
            </p>
            {parcelas.length > 0 && (
              <p className="text-slate-400">
                1ª parcela em {fmtDia(parcelas[0].dueDate)} · última em {fmtDia(parcelas[parcelas.length - 1].dueDate)}
              </p>
            )}
          </div>
        )}

        {erro && <p className="text-xs text-red-500">{erro}</p>}
        <div className="flex gap-2">
          <button disabled={salvando || abertas > 0 || !capital} className="flex-1 bg-emerald-600 text-white rounded-lg py-2 text-sm hover:bg-emerald-700 disabled:opacity-50">
            {salvando ? "Renovando…" : "Confirmar renovação"}
          </button>
          <button type="button" onClick={onClose} className="px-3 text-sm text-slate-500 hover:text-slate-700">Cancelar</button>
        </div>
      </form>
    </div>,
    document.body
  );
}
