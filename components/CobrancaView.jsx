"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ContactModal from "@/components/ContactModal";
import TentativaModal from "@/components/TentativaModal";
import Icone from "@/components/Icones";
import ComissaoPainel from "@/components/ComissaoPainel";

const money = (n) =>
  "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const CANAL_LABEL = { whatsapp: "sugestão: WhatsApp", ligacao: "sugestão: ligar", presencial: "sugestão: visitar", notificacao: "sugestão: notificação" };

const FAIXAS = [
  { key: "", label: "Todos" },
  { key: "1-7", label: "1-7 dias", min: 1, max: 7 },
  { key: "8-15", label: "8-15 dias", min: 8, max: 15 },
  { key: "16+", label: "+15 dias", min: 16, max: Infinity },
];

const ORDENS = [
  { key: "prioridade", label: "Prioridade" },
  { key: "atraso", label: "Mais atrasados" },
  { key: "valor", label: "Maior valor" },
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
  const [ordem, setOrdem] = useState("prioridade");
  const [responsavel, setResponsavel] = useState("");
  const [openContactId, setOpenContactId] = useState(null);
  const [tentativaDe, setTentativaDe] = useState(null);
  const [modoFoco, setModoFoco] = useState(false);
  const [prestacaoAberta, setPrestacaoAberta] = useState(false);
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
    const base = fila.filter((item) => {
      if (f && f.min != null && (item.diasAtraso < f.min || item.diasAtraso > f.max)) return false;
      if (responsavel && item.responsavel !== responsavel) return false;
      return true;
    });
    // A fila já vem por prioridade do servidor; as outras ordens reordenam aqui.
    // Empate desfeito pelo valor em aberto, pra ordem não ficar instável.
    if (ordem === "atraso") {
      return [...base].sort((a, b) => b.diasAtraso - a.diasAtraso || b.valorAberto - a.valorAberto);
    }
    if (ordem === "valor") {
      return [...base].sort((a, b) => b.valorAberto - a.valorAberto || b.diasAtraso - a.diasAtraso);
    }
    return base;
  }, [fila, faixa, responsavel, ordem]);

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
          {item.promessaQuebrada && (
            <p className="flex items-center justify-center gap-1 text-[11px] text-red-600 font-semibold mt-2">
              <Icone nome="alerta" className="w-3 h-3" />
              Prometeu pagar em {new Date(item.dataPromessa).toLocaleDateString("pt-BR", { timeZone: "UTC" })} e não pagou
            </p>
          )}
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
            {ordem === "prioridade"
              ? "Ordenada por prioridade — quem atrasou menos aparece antes, porque tem mais chance de pagar."
              : ordem === "atraso"
              ? "Ordenada pelos mais atrasados primeiro."
              : "Ordenada pelo maior valor em aberto."}
          </p>
        </div>
        <button
          onClick={() => setPrestacaoAberta(true)}
          className="ml-auto flex items-center gap-1 text-xs rounded-full px-3.5 py-1.5 border border-slate-200 bg-white text-slate-600 hover:border-slate-300 transition-colors shrink-0"
        >
          <Icone nome="documento" className="w-3.5 h-3.5" /> Prestação do dia
        </button>
        <button
          onClick={() => { setIndiceFoco(0); setModoFoco(true); }}
          disabled={filtrada.length === 0}
          className="flex items-center gap-1 text-xs rounded-full px-3.5 py-1.5 bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-40 transition-colors shrink-0"
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
        <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
          {ORDENS.map((o) => (
            <button
              key={o.key}
              onClick={() => setOrdem(o.key)}
              title={
                o.key === "prioridade"
                  ? "Valor em aberto x urgência do atraso — quem atrasou menos vem antes, porque tem mais chance de pagar"
                  : o.key === "atraso"
                  ? "Do atraso maior pro menor"
                  : "Do maior valor em aberto pro menor"
              }
              className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                ordem === o.key ? "bg-white shadow-sm text-slate-700 font-medium" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {o.label}
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

      <ComissaoPainel />

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
                  {item.canalSugerido && (
                    <span className="text-[10px] rounded-full px-2 py-0.5 bg-violet-50 text-violet-600">
                      {CANAL_LABEL[item.canalSugerido] || item.canalSugerido}
                    </span>
                  )}
                  {item.promessaQuebrada && (
                    <span
                      className="flex items-center gap-1 text-[10px] rounded-full px-2 py-0.5 bg-red-100 text-red-700 font-semibold"
                      title={`Prometeu pagar em ${new Date(item.dataPromessa).toLocaleDateString("pt-BR", { timeZone: "UTC" })} e não pagou`}
                    >
                      <Icone nome="alerta" className="w-2.5 h-2.5" /> promessa quebrada
                    </span>
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
      {prestacaoAberta && <PrestacaoContasModal onClose={() => setPrestacaoAberta(false)} />}
    </div>
  );
}

// Prestação de contas do dia (item 38) — o próprio cobrador registra ao
// encerrar. Um envio por dia: reenviar no mesmo dia atualiza em vez de duplicar.
function PrestacaoContasModal({ onClose }) {
  const [form, setForm] = useState({ visitas: "", recebidoDinheiro: "", recebidoPix: "", observacao: "" });
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true);
    await fetch("/api/prestacao-contas", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        visitas: form.visitas === "" ? null : Number(form.visitas),
        recebidoDinheiro: form.recebidoDinheiro === "" ? null : Number(form.recebidoDinheiro),
        recebidoPix: form.recebidoPix === "" ? null : Number(form.recebidoPix),
        observacao: form.observacao || null,
      }),
    });
    setSalvando(false);
    setSalvo(true);
    setTimeout(onClose, 1000);
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onClick={onClose}>
      <form onSubmit={salvar} className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-800">Prestação de contas do dia</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
        <p className="text-xs text-slate-400">Um relato rápido do que você fez hoje — não muda nada no sistema, é sua conferência.</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-xs text-slate-400">Visitas feitas</span>
            <input type="number" min="0" value={form.visitas} onChange={(e) => setForm((f) => ({ ...f, visitas: e.target.value }))} className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400" />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">Recebido em dinheiro</span>
            <input type="number" step="0.01" min="0" value={form.recebidoDinheiro} onChange={(e) => setForm((f) => ({ ...f, recebidoDinheiro: e.target.value }))} className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400" />
          </label>
          <label className="block col-span-2">
            <span className="text-xs text-slate-400">Recebido em Pix</span>
            <input type="number" step="0.01" min="0" value={form.recebidoPix} onChange={(e) => setForm((f) => ({ ...f, recebidoPix: e.target.value }))} className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400" />
          </label>
        </div>
        <label className="block">
          <span className="text-xs text-slate-400">Observações</span>
          <textarea rows={2} value={form.observacao} onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))} className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400 resize-none" />
        </label>
        <button disabled={salvando} className="w-full bg-emerald-500 text-white rounded-lg py-2 text-sm font-medium hover:bg-emerald-600 disabled:opacity-50">
          {salvando ? "Salvando…" : salvo ? "Salvo!" : "Enviar"}
        </button>
      </form>
    </div>
  );
}
