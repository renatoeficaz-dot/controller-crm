"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ContactModal from "@/components/ContactModal";
import TentativaModal from "@/components/TentativaModal";

const money = (n) =>
  "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const FAIXAS = [
  { key: "", label: "Todos" },
  { key: "1-7", label: "1-7 dias", min: 1, max: 7 },
  { key: "8-15", label: "8-15 dias", min: 8, max: 15 },
  { key: "16+", label: "+15 dias", min: 16, max: Infinity },
];

function corAtraso(dias) {
  if (dias <= 7) return "text-amber-600";
  if (dias <= 15) return "text-red-500";
  return "text-red-700";
}

export default function CobrancaView() {
  const [fila, setFila] = useState([]);
  const [loading, setLoading] = useState(true);
  const [faixa, setFaixa] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [openContactId, setOpenContactId] = useState(null);
  const [tentativaDe, setTentativaDe] = useState(null);

  const load = useCallback(async () => {
    const data = await fetch("/api/cobranca/fila").then((r) => r.json()).catch(() => []);
    setFila(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const responsaveis = useMemo(
    () => Array.from(new Set(fila.map((f) => f.responsavel).filter(Boolean))).sort(),
    [fila]
  );

  const filtrada = useMemo(() => {
    const f = FAIXAS.find((x) => x.key === faixa);
    return fila.filter((item) => {
      if (f && f.min != null && (item.diasAtraso < f.min || item.diasAtraso > f.max)) return false;
      if (responsavel && item.responsavel !== responsavel) return false;
      return true;
    });
  }, [fila, faixa, responsavel]);

  const totais = useMemo(
    () => ({
      clientes: filtrada.length,
      valor: filtrada.reduce((acc, f) => acc + f.valorAberto, 0),
    }),
    [filtrada]
  );

  async function darBaixa(item) {
    if (!confirm(`Dar baixa na ${item.proximaParcelaNumero}ª parcela de ${item.name} (${money(item.proximaParcelaValor)})?`)) return;
    await fetch(`/api/parcelas/${item.proximaParcelaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paid: true }),
    });
    load();
  }

  if (loading) return <div className="p-6 text-slate-400">Carregando fila…</div>;

  return (
    <div className="flex-1 overflow-y-auto thin-scroll p-3 md:p-6 flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-1">
          <h1 className="font-semibold text-slate-800 text-sm md:text-base">Fila de cobrança</h1>
          <p className="text-xs text-slate-400 hidden sm:block">
            Ordenada por prioridade — quem atrasou menos aparece antes, porque tem mais chance de pagar.
          </p>
        </div>
        <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5 ml-auto">
          {FAIXAS.map((f) => (
            <button
              key={f.key || "todos"}
              onClick={() => setFaixa(f.key)}
              className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                faixa === f.key ? "bg-white shadow-sm text-slate-700 font-medium" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {responsaveis.length > 0 && (
          <select
            value={responsavel}
            onChange={(e) => setResponsavel(e.target.value)}
            className="text-xs rounded-full px-3 py-1.5 border bg-white border-slate-200 text-slate-600 outline-none focus:border-emerald-400"
          >
            <option value="">Todos os responsáveis</option>
            {responsaveis.map((r) => (<option key={r} value={r}>{r}</option>))}
          </select>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-400">Clientes na fila</p>
          <p className="text-2xl font-semibold mt-1 text-slate-700">{totais.clientes}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-400">Total em aberto</p>
          <p className="text-2xl font-semibold mt-1 text-red-500">{money(totais.valor)}</p>
        </div>
      </div>

      {filtrada.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <p className="text-sm text-slate-400">Nenhum cliente a cobrar com esses filtros. 🎉</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {filtrada.map((item) => (
            <div key={item.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <button
                type="button"
                onClick={() => setOpenContactId(item.id)}
                className="min-w-0 flex-1 text-left"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-slate-700 truncate">{item.name}</span>
                  <span className={`text-xs font-semibold ${corAtraso(item.diasAtraso)}`}>
                    {item.diasAtraso}d de atraso
                  </span>
                  {item.etapa === "Cravo" && (
                    <span className="text-[10px] rounded-full px-2 py-0.5 bg-red-50 text-red-600">Cravo</span>
                  )}
                  {item.tentativasHoje > 0 && (
                    <span className="text-[10px] rounded-full px-2 py-0.5 bg-slate-100 text-slate-500">
                      {item.tentativasHoje} tentativa(s) hoje
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5 truncate">
                  {item.phone} · {item.parcelasAtrasadas} parcela(s) atrasada(s)
                  {item.responsavel ? ` · ${item.responsavel}` : ""}
                </p>
              </button>

              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-slate-700">{money(item.valorAberto)}</p>
                <p className="text-[11px] text-slate-400">em aberto</p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                <a
                  href={`https://wa.me/${String(item.phone || "").replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs rounded-lg px-3 py-2 bg-emerald-500 text-white hover:bg-emerald-600 transition-colors"
                >
                  WhatsApp
                </a>
                <button
                  onClick={() => setTentativaDe(item)}
                  className="text-xs rounded-lg px-3 py-2 border border-slate-200 text-slate-600 hover:border-slate-300 transition-colors"
                >
                  Tentativa
                </button>
                <button
                  onClick={() => darBaixa(item)}
                  className="text-xs rounded-lg px-3 py-2 border border-emerald-200 text-emerald-600 hover:bg-emerald-50 transition-colors"
                >
                  Dar baixa
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tentativaDe && (
        <TentativaModal
          contactId={tentativaDe.id}
          contactName={tentativaDe.name}
          onClose={() => setTentativaDe(null)}
          onSalvou={() => { setTentativaDe(null); load(); }}
        />
      )}

      {openContactId && (
        <ContactModal contactId={openContactId} onClose={() => setOpenContactId(null)} onChanged={load} />
      )}
    </div>
  );
}
