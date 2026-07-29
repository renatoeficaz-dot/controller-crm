"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ContactModal from "@/components/ContactModal";
import TentativaModal from "@/components/TentativaModal";
import Icone from "@/components/Icones";

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
  const [modoFoco, setModoFoco] = useState(false);
  const [indiceFoco, setIndiceFoco] = useState(0);

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

  async function darBaixa(item, avancar = false) {
    if (!confirm(`Dar baixa na ${item.proximaParcelaNumero}ª parcela de ${item.name} (${money(item.proximaParcelaValor)})?`)) return;
    await fetch(`/api/parcelas/${item.proximaParcelaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paid: true }),
    });
    if (avancar) proximo();
    load();
  }

  // No modo foco a lista muda embaixo do índice conforme as baixas acontecem,
  // então limita ao tamanho atual em vez de deixar estourar.
  function proximo() {
    setIndiceFoco((i) => Math.min(i + 1, Math.max(0, filtrada.length - 1)));
  }

  if (loading) return <div className="p-6 text-slate-400">Carregando fila…</div>;

  // Modo foco: um cliente por vez, alvo de toque grande — feito pra usar no
  // celular durante a rota de cobrança.
  if (modoFoco) {
    const item = filtrada[Math.min(indiceFoco, filtrada.length - 1)];
    if (!item) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-3">
          <p className="text-sm text-slate-400 flex items-center justify-center gap-1.5">Fila concluída. <Icone nome="trofeu" className="w-4 h-4" /></p>
          <button onClick={() => setModoFoco(false)} className="text-sm text-emerald-600">Voltar para a lista</button>
        </div>
      );
    }
    const tel = String(item.phone || "").replace(/\D/g, "");
    return (
      <div className="flex-1 overflow-y-auto thin-scroll p-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <button onClick={() => setModoFoco(false)} className="text-sm text-slate-500">← Lista</button>
          <span className="text-xs text-slate-400">
            {Math.min(indiceFoco + 1, filtrada.length)} de {filtrada.length}
          </span>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 text-center">
          <p className="text-xl font-semibold text-slate-800">{item.name}</p>
          <p className="text-sm text-slate-400 mt-0.5">{item.phone}</p>
          <p className={`text-sm font-semibold mt-3 ${corAtraso(item.diasAtraso)}`}>
            {item.diasAtraso} dias de atraso · {item.parcelasAtrasadas} parcela(s)
          </p>
          <p className="text-3xl font-bold text-slate-800 mt-2">{money(item.valorAberto)}</p>
          <p className="text-xs text-slate-400">em aberto</p>
          {item.tentativasHoje > 0 && (
            <p className="text-[11px] text-amber-600 mt-2">
              Já houve {item.tentativasHoje} tentativa(s) com esse cliente hoje
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <a
            href={`https://wa.me/${tel}`}
            target="_blank"
            rel="noreferrer"
            className="bg-emerald-500 text-white rounded-xl py-4 text-center font-medium hover:bg-emerald-600 transition-colors"
          >
            WhatsApp
          </a>
          <a
            href={`tel:${tel}`}
            className="border border-slate-200 text-slate-600 rounded-xl py-4 text-center font-medium hover:bg-slate-50 transition-colors"
          >
            Ligar
          </a>
          <button
            onClick={() => setTentativaDe(item)}
            className="border border-slate-200 text-slate-600 rounded-xl py-4 font-medium hover:bg-slate-50 transition-colors"
          >
            Registrar tentativa
          </button>
          <button
            onClick={() => darBaixa(item, true)}
            className="border border-emerald-200 text-emerald-600 rounded-xl py-4 font-medium hover:bg-emerald-50 transition-colors"
          >
            Dar baixa
          </button>
        </div>

        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => setIndiceFoco((i) => Math.max(0, i - 1))}
            disabled={indiceFoco === 0}
            className="text-sm text-slate-500 disabled:opacity-40"
          >
            ← Anterior
          </button>
          <button onClick={() => setOpenContactId(item.id)} className="text-sm text-sky-600">
            Abrir ficha
          </button>
          <button onClick={proximo} className="text-sm text-slate-600 font-medium">
            Pular →
          </button>
        </div>

        {tentativaDe && (
          <TentativaModal
            contactId={tentativaDe.id}
            contactName={tentativaDe.name}
            onClose={() => setTentativaDe(null)}
            onSalvou={() => { setTentativaDe(null); proximo(); load(); }}
          />
        )}
        {openContactId && (
          <ContactModal contactId={openContactId} onClose={() => setOpenContactId(null)} onChanged={load} />
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto thin-scroll p-3 md:p-6 flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-1">
          <h1 className="font-semibold text-slate-800 text-sm md:text-base">Fila de cobrança</h1>
          <p className="text-xs text-slate-400 hidden sm:block">
            Ordenada por prioridade — quem atrasou menos aparece antes, porque tem mais chance de pagar.
          </p>
        </div>
        <button
          onClick={() => { setIndiceFoco(0); setModoFoco(true); }}
          disabled={filtrada.length === 0}
          className="ml-auto flex items-center gap-1 text-xs rounded-full px-3.5 py-1.5 bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-40 transition-colors shrink-0"
        >
          <Icone nome="meta" className="w-3.5 h-3.5" /> Modo foco
        </button>
        <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
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
          <p className="text-sm text-slate-400 flex items-center justify-center gap-1.5">Nenhum cliente a cobrar com esses filtros. <Icone nome="trofeu" className="w-4 h-4" /></p>
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
