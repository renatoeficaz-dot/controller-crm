"use client";

import { useCallback, useEffect, useState } from "react";
import ContactModal from "@/components/ContactModal";
import Icone from "@/components/Icones";

const money = (n) =>
  "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const COR_RISCO = {
  baixo: "bg-emerald-50 text-emerald-600",
  medio: "bg-amber-50 text-amber-600",
  alto: "bg-red-50 text-red-600",
  bloqueio: "bg-red-100 text-red-700",
};

// Fila de espera por capital: quem já está aprovado aguardando o dinheiro sair,
// e até onde o saldo de hoje alcança.
export default function FilaLiberacaoView() {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openContactId, setOpenContactId] = useState(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/fila-liberacao").then((res) => (res.ok ? res.json() : null)).catch(() => null);
    setD(r);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  if (loading) return <p className="text-sm text-slate-400">Carregando fila…</p>;
  if (!d) return <p className="text-sm text-slate-400">Não foi possível carregar a fila.</p>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-4">
          <p className="text-xs text-slate-400">Saldo em caixa</p>
          <p className="text-xl font-semibold text-emerald-600 mt-1">{money(d.saldo)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-4">
          <p className="text-xs text-slate-400">Esperando liberação</p>
          <p className="text-xl font-semibold text-slate-700 mt-1">{money(d.totalNecessario)}</p>
          <p className="text-[11px] text-slate-400">{d.fila.length} lead(s)</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-4">
          <p className="text-xs text-slate-400">Dá pra atender agora</p>
          <p className="text-xl font-semibold text-sky-600 mt-1">{d.quantosCabem}</p>
          <p className="text-[11px] text-slate-400">de {d.fila.length} na fila</p>
        </div>
      </div>

      {d.fila.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-8 text-center">
          <p className="text-sm text-slate-400">Ninguém esperando liberação de capital.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-800">Fila por tempo de espera</h2>
            <p className="text-[11px] text-slate-400">
              Quem está esperando há mais tempo aparece primeiro. A marca verde indica até onde o saldo de hoje alcança.
            </p>
          </div>
          <ul className="divide-y divide-slate-50">
            {d.fila.map((c, i) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setOpenContactId(c.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50/80 transition-colors"
                >
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 ${
                      c.cabeNoSaldo ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"
                    }`}
                    title={c.cabeNoSaldo ? "Cabe no saldo de hoje" : "Depende de entrar mais dinheiro"}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-slate-700 truncate">{c.name || "Sem nome"}</span>
                      {c.puxadaRisco && (
                        <span className={`text-[10px] rounded-full px-2 py-0.5 ${COR_RISCO[c.puxadaRisco] || "bg-slate-100 text-slate-500"}`}>
                          risco {c.puxadaRisco}
                          {c.puxadaScore != null ? ` · ${c.puxadaScore}` : ""}
                        </span>
                      )}
                      {(c.cicloAtual || 1) > 1 && (
                        <span className="text-[10px] rounded-full px-2 py-0.5 bg-sky-50 text-sky-600">
                          ciclo {c.cicloAtual}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 truncate">
                      {c.phone || "sem telefone"} · esperando {c.diasEsperando} dia(s)
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium text-slate-700">{money(c.valorCapital)}</p>
                    <p className="text-[10px] text-slate-400">acum. {money(c.acumulado)}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {openContactId && (
        <ContactModal contactId={openContactId} onClose={() => setOpenContactId(null)} onChanged={load} />
      )}
    </div>
  );
}
