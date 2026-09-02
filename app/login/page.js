"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CalculadoraEntrada, { jaDestravado } from "@/components/CalculadoraEntrada";

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ login: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // null = ainda não sei se a calculadora está ligada. Enquanto não sei, não
  // mostro nem uma coisa nem outra: piscar o login antes de virar calculadora
  // entregaria o disfarce logo na primeira olhada.
  const [calculadoraAtiva, setCalculadoraAtiva] = useState(null);
  const [liberado, setLiberado] = useState(false);

  useEffect(() => {
    // Saída de emergência: /login?direto=1 pula a calculadora. Existe porque
    // um código esquecido trancaria todo mundo pra fora sem jeito de voltar —
    // e o login continua sendo quem protege os dados de verdade.
    // Lido de window em vez de useSearchParams: o hook obriga a envolver a
    // página num Suspense, e aqui isso só serviria pra ler um parâmetro.
    if (new URLSearchParams(window.location.search).get("direto")) {
      setCalculadoraAtiva(false);
      return;
    }
    // Destravou nesta aba (veio da trava do app): não pede o código de novo.
    if (jaDestravado()) { setCalculadoraAtiva(false); return; }
    fetch("/api/auth/calculadora")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setCalculadoraAtiva(!!d?.ativo))
      .catch(() => setCalculadoraAtiva(false));
  }, []);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setLoading(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Não foi possível entrar.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  // Ainda checando: tela preta neutra, sem pista do que vem a seguir.
  if (calculadoraAtiva === null) return <div className="flex-1 bg-black" />;
  if (calculadoraAtiva && !liberado) {
    return <CalculadoraEntrada onAbrir={() => setLiberado(true)} />;
  }

  return (
    <div className="flex-1 flex items-center justify-center bg-slate-50 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 shadow-sm p-7 space-y-4"
      >
        <div className="flex items-center gap-2 justify-center mb-2">
          <div className="w-9 h-9 rounded-lg bg-emerald-500 flex items-center justify-center text-white font-bold">
            C
          </div>
          <span className="font-semibold text-slate-800 text-lg">Controller</span>
        </div>
        <h1 className="text-center text-sm text-slate-500">Entrar no sistema</h1>

        <label className="block">
          <span className="text-xs text-slate-400">Login</span>
          <input
            autoFocus
            value={form.login}
            onChange={(e) => setForm((f) => ({ ...f, login: e.target.value }))}
            className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-emerald-400"
            placeholder="seu login"
          />
        </label>
        <label className="block">
          <span className="text-xs text-slate-400">Senha</span>
          <input
            type="password"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-emerald-400"
            placeholder="••••••"
          />
        </label>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <button
          disabled={loading}
          className="w-full bg-emerald-500 text-white rounded-lg py-2 text-sm font-medium hover:bg-emerald-600 disabled:opacity-50"
        >
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
