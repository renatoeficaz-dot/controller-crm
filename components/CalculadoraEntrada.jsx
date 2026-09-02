"use client";

import { useEffect, useState } from "react";

// Calculadora funcional que serve de porta de entrada. Digitando o código
// configurado e apertando "=", ela abre o login.
//
// É DISFARCE, não segurança: quem protege os dados continua sendo o login.
// O código é conferido no servidor justamente pra não ficar no JS da página.
const TECLAS = [
  ["AC", "±", "%", "÷"],
  ["7", "8", "9", "×"],
  ["4", "5", "6", "−"],
  ["1", "2", "3", "+"],
  ["0", ",", "="],
];

const OPERADORES = { "÷": "/", "×": "*", "−": "-", "+": "+" };

// Vale só pra esta aba e morre quando ela fecha — é o que separa "navegar
// dentro do sistema" de "abrir o sistema de novo".
export const CHAVE_DESTRAVADO = "crm-calc-destravado";

export function jaDestravado() {
  try {
    return sessionStorage.getItem(CHAVE_DESTRAVADO) === "1";
  } catch {
    // Navegador bloqueando storage: melhor pedir o código do que estourar.
    return false;
  }
}

export default function CalculadoraEntrada({ onAbrir }) {
  const [visor, setVisor] = useState("0");
  const [acumulado, setAcumulado] = useState(null); // { valor, op }
  const [novoNumero, setNovoNumero] = useState(true);
  const [verificando, setVerificando] = useState(false);
  // O que a pessoa digitou desde o último AC/=, só dígitos: é isso que vira
  // tentativa de código. Guardado à parte do visor porque o visor é
  // reescrito pelo resultado das contas.
  const [digitado, setDigitado] = useState("");

  // Teclado físico funcionando — uma calculadora que só aceita clique
  // denuncia que não é uma calculadora de verdade.
  useEffect(() => {
    function aoTeclar(e) {
      const k = e.key;
      if (/^[0-9]$/.test(k)) return apertar(k);
      if (k === "." || k === ",") return apertar(",");
      if (k === "+") return apertar("+");
      if (k === "-") return apertar("−");
      if (k === "*") return apertar("×");
      if (k === "/") return apertar("÷");
      if (k === "%") return apertar("%");
      if (k === "Enter" || k === "=") return apertar("=");
      if (k === "Escape") return apertar("AC");
      if (k === "Backspace") {
        setVisor((v) => (v.length > 1 ? v.slice(0, -1) : "0"));
        setDigitado((d) => d.slice(0, -1));
      }
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  });

  const formatar = (n) => {
    if (!Number.isFinite(n)) return "Erro";
    const s = Math.abs(n) >= 1e12 ? n.toExponential(6) : String(Math.round(n * 1e10) / 1e10);
    return s.replace(".", ",");
  };

  function calcular(a, op, b) {
    switch (op) {
      case "+": return a + b;
      case "-": return a - b;
      case "*": return a * b;
      case "/": return b === 0 ? NaN : a / b;
      default: return b;
    }
  }

  const valorAtual = () => Number(visor.replace(/\./g, "").replace(",", ".")) || 0;

  async function tentarCodigo(codigo) {
    setVerificando(true);
    const r = await fetch("/api/auth/calculadora", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo }),
    })
      .then((x) => (x.ok ? x.json() : null))
      .catch(() => null);
    setVerificando(false);
    if (r?.ok) {
      // Marca a aba como destravada. sessionStorage e não memória: qualquer
      // recarga de página (e algumas telas recarregam de verdade) remontava a
      // trava e pedia o código de novo no meio do trabalho. Aqui ela some
      // quando a aba/app fecha, que é o "abrir o sistema" de novo.
      try { sessionStorage.setItem(CHAVE_DESTRAVADO, "1"); } catch {}
      onAbrir?.();
    }
    return !!r?.ok;
  }

  async function apertar(t) {
    if (verificando) return;

    if (t === "AC") {
      setVisor("0");
      setAcumulado(null);
      setNovoNumero(true);
      setDigitado("");
      return;
    }

    if (t === "=") {
      // Primeiro a tentativa de código. Se não for, faz a conta normalmente —
      // uma calculadora que trava no "=" errado entregaria o disfarce.
      if (digitado) {
        const abriu = await tentarCodigo(digitado);
        if (abriu) return;
      }
      if (acumulado) {
        const res = calcular(acumulado.valor, acumulado.op, valorAtual());
        setVisor(formatar(res));
        setAcumulado(null);
      }
      setNovoNumero(true);
      setDigitado("");
      return;
    }

    if (OPERADORES[t]) {
      const atual = valorAtual();
      // Encadear (2 + 3 + 4) resolve o pendente antes de guardar o próximo.
      const base = acumulado ? calcular(acumulado.valor, acumulado.op, atual) : atual;
      setVisor(formatar(base));
      setAcumulado({ valor: base, op: OPERADORES[t] });
      setNovoNumero(true);
      return;
    }

    if (t === "±") {
      setVisor((v) => (v.startsWith("-") ? v.slice(1) : v === "0" ? v : "-" + v));
      return;
    }

    if (t === "%") {
      setVisor(formatar(valorAtual() / 100));
      setNovoNumero(true);
      return;
    }

    if (t === ",") {
      setVisor((v) => (novoNumero ? "0," : v.includes(",") ? v : v + ","));
      setNovoNumero(false);
      return;
    }

    // Dígito
    setVisor((v) => (novoNumero || v === "0" ? t : v + t));
    setNovoNumero(false);
    setDigitado((d) => (d + t).slice(-32));
  }

  const corTecla = (t) => {
    if (OPERADORES[t] || t === "=") return "bg-[#ff9f0a] text-white active:bg-[#ffb340]";
    if (["AC", "±", "%"].includes(t)) return "bg-[#a5a5a5] text-black active:bg-[#c4c4c4]";
    return "bg-[#333333] text-white active:bg-[#555555]";
  };

  return (
    <div className="flex-1 flex items-center justify-center bg-black p-4">
      <div className="w-full max-w-xs">
        <div className="text-right text-white text-6xl font-light px-3 py-8 truncate tabular-nums">
          {visor}
        </div>
        <div className="grid grid-cols-4 gap-3">
          {TECLAS.flat().map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => apertar(t)}
              className={`${corTecla(t)} ${t === "0" ? "col-span-2 rounded-full text-left pl-7" : "rounded-full"} h-[72px] text-2xl font-medium transition-colors`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
