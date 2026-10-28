"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

const TECLAS = [
  ["C", "⌫", "%", "÷"],
  ["7", "8", "9", "×"],
  ["4", "5", "6", "−"],
  ["1", "2", "3", "+"],
  ["±", "0", ",", "="],
];

// Calcula a expressão digitada (só números e + − × ÷ %). Sem eval: percorre os termos respeitando × ÷ antes de + −.
function calcular(expr) {
  const tokens = expr.match(/\d+(?:\.\d+)?|[+\-*/]/g);
  if (!tokens) return null;
  const nums = [];
  const ops = [];
  let esperaNumero = true;
  for (const t of tokens) {
    if (esperaNumero) {
      if (t === "-") { nums.push(0); ops.push("-"); continue; }
      if (!/\d/.test(t)) return null;
      nums.push(Number(t));
      esperaNumero = false;
    } else {
      if (!/[+\-*/]/.test(t)) return null;
      ops.push(t);
      esperaNumero = true;
    }
  }
  if (esperaNumero) return null;
  // primeira passada: × e ÷
  const n2 = [nums[0]];
  const o2 = [];
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    const b = nums[i + 1];
    if (op === "*" || op === "/") {
      const a = n2.pop();
      if (op === "/" && b === 0) return null;
      n2.push(op === "*" ? a * b : a / b);
    } else {
      o2.push(op);
      n2.push(b);
    }
  }
  let r = n2[0];
  for (let i = 0; i < o2.length; i++) r = o2[i] === "+" ? r + n2[i + 1] : r - n2[i + 1];
  return Number.isFinite(r) ? Math.round(r * 1e8) / 1e8 : null;
}

const fmt = (n) => n.toLocaleString("pt-BR", { maximumFractionDigits: 8 });

// Calculadora rápida em modal: teclado na tela e do computador. "Usar no texto" devolve o resultado pra caixa de mensagem.
export default function CalculadoraRapida({ onClose, onUsar }) {
  const [expr, setExpr] = useState(""); // usa . decimal e * / internamente
  const [resultado, setResultado] = useState(null);
  const [montado, setMontado] = useState(false);
  const [copiado, setCopiado] = useState(false);
  useEffect(() => setMontado(true), []);

  const mostrar = (e) => e.replace(/\*/g, "×").replace(/\//g, "÷").replace(/-/g, "−").replace(/\./g, ",");

  const apertar = useCallback((t) => {
    setCopiado(false);
    let a = expr;
    if (resultado != null) {
      // depois de "=": dígito começa conta nova; operador continua a partir do resultado
      a = /^[\d,]$/.test(t) ? "" : String(resultado);
      setResultado(null);
    }
    let n = a;
    if (t === "C") n = "";
    else if (t === "⌫") n = a.slice(0, -1);
    else if (t === "±") {
      const m = a.match(/(-?\d+(?:\.\d+)?)$/);
      if (m) n = a.slice(0, a.length - m[1].length) + (m[1].startsWith("-") ? m[1].slice(1) : "-" + m[1]);
    } else if (t === "%") {
      const m = a.match(/(\d+(?:\.\d+)?)$/);
      if (m) n = a.slice(0, a.length - m[1].length) + String(Number(m[1]) / 100);
    } else if (t === "=") {
      const r = calcular(a);
      if (r != null) { setResultado(r); n = String(r); }
    } else if (["÷", "×", "−", "+"].includes(t)) {
      const op = { "÷": "/", "×": "*", "−": "-", "+": "+" }[t];
      if (!a && op !== "-") n = a;
      else if (/[+\-*/]$/.test(a)) n = a.slice(0, -1) + op;
      else n = a + op;
    } else if (t === ",") {
      const m = a.match(/(\d+(?:\.\d+)?)$/);
      if (m && m[1].includes(".")) n = a;
      else n = (m ? a : a + "0") + ".";
    } else {
      n = a + t; // dígito
    }
    setExpr(n);
  }, [expr, resultado]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") { onClose?.(); return; }
      if (/^\d$/.test(e.key)) apertar(e.key);
      else if (e.key === "+") apertar("+");
      else if (e.key === "-") apertar("−");
      else if (e.key === "*" || e.key === "x") apertar("×");
      else if (e.key === "/") { e.preventDefault(); apertar("÷"); }
      else if (e.key === "," || e.key === ".") apertar(",");
      else if (e.key === "%") apertar("%");
      else if (e.key === "Enter" || e.key === "=") { e.preventDefault(); apertar("="); }
      else if (e.key === "Backspace") apertar("⌫");
      else if (e.key === "Delete") apertar("C");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [apertar, onClose]);

  // Prévia ao vivo do resultado (sem apertar =)
  const previa = resultado == null && /[+\-*/]/.test(expr.slice(1)) ? calcular(expr) : null;
  const valorFinal = resultado != null ? resultado : previa;

  async function copiar() {
    if (valorFinal == null) return;
    try { await navigator.clipboard.writeText(String(valorFinal).replace(".", ",")); setCopiado(true); setTimeout(() => setCopiado(false), 1200); } catch {}
  }

  if (!montado) return null;
  return createPortal(
    <div className="fixed inset-0 z-[80] bg-black/30 flex items-end sm:items-center justify-center p-3" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-[300px] p-3 space-y-2" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-700">Calculadora</span>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-right min-h-[64px] flex flex-col justify-end">
          <p className="text-xs text-slate-400 break-all min-h-[16px]">{expr ? mostrar(expr) : ""}</p>
          <p className="text-2xl font-semibold text-slate-800 break-all">{valorFinal != null ? fmt(valorFinal) : expr ? mostrar(expr.match(/[\d.]+$/)?.[0] || "0") : "0"}</p>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {TECLAS.flat().map((t) => {
            const op = ["÷", "×", "−", "+"].includes(t);
            const igual = t === "=";
            return (
              <button
                key={t}
                type="button"
                onClick={() => apertar(t)}
                className={`h-11 rounded-lg text-base font-medium transition-colors ${
                  igual ? "bg-emerald-500 text-white hover:bg-emerald-600"
                    : op ? "bg-slate-200 text-slate-700 hover:bg-slate-300"
                    : t === "C" ? "bg-red-50 text-red-500 hover:bg-red-100"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {t}
              </button>
            );
          })}
        </div>
        <div className="flex gap-1.5">
          <button type="button" disabled={valorFinal == null} onClick={copiar} className="flex-1 text-xs border border-slate-200 rounded-lg py-2 text-slate-600 hover:bg-slate-50 disabled:opacity-40">
            {copiado ? "Copiado ✓" : "Copiar"}
          </button>
          {onUsar && (
            <button type="button" disabled={valorFinal == null} onClick={() => { onUsar(String(valorFinal).replace(".", ",")); onClose?.(); }} className="flex-1 text-xs bg-emerald-500 text-white rounded-lg py-2 hover:bg-emerald-600 disabled:opacity-40">
              Usar no texto
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
