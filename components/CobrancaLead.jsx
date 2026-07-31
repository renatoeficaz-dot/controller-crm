"use client";

import { useCallback, useEffect, useState } from "react";
import { interpolarVariaveis, situacaoCobranca } from "@/lib/variaveis";
import TentativaModal, { RESULTADO_LABEL, TIPO_LABEL } from "@/components/TentativaModal";
import { faixaComportamental, FAIXA_COMPORT_LABEL } from "@/lib/scoreComportamental";
import Icone from "@/components/Icones";
import AcordoModal from "@/components/AcordoModal";

const NEGOCIACAO_LABEL = {
  acordo_parcelado: "Acordo parcelado",
  desconto_aceito: "Desconto aceito",
  desconto_recusado: "Desconto recusado",
  outro: "Anotação",
};

const NEGOCIACAO_COR = {
  acordo_parcelado: "text-sky-600",
  desconto_aceito: "text-emerald-600",
  desconto_recusado: "text-red-500",
  outro: "text-slate-500",
};

const money = (n) =>
  "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const COR_COMPORT = {
  bom: { texto: "text-emerald-700", barra: "bg-emerald-500", fundo: "bg-emerald-50", borda: "border-emerald-200" },
  regular: { texto: "text-amber-700", barra: "bg-amber-500", fundo: "bg-amber-50", borda: "border-amber-200" },
  ruim: { texto: "text-red-700", barra: "bg-red-500", fundo: "bg-red-50", borda: "border-red-200" },
};

const COR_RESULTADO = {
  atendeu: "text-emerald-600",
  prometeu: "text-sky-600",
  nao_atendeu: "text-slate-400",
  recusou: "text-red-500",
  numero_errado: "text-amber-600",
};

// Bloco de cobrança do card do lead: oferta de quitação à vista (quando o
// cliente se qualifica) e histórico de tentativas de contato. Compartilhado
// entre o modal do Kanban e o painel do Chat.
export default function CobrancaLead({ contactId, contact, onChanged }) {
  const [cfg, setCfg] = useState(null);
  const [tentativas, setTentativas] = useState([]);
  const [negociacoes, setNegociacoes] = useState([]);
  const [modalAberto, setModalAberto] = useState(false);
  const [acordoAberto, setAcordoAberto] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [naoPerturbarAberto, setNaoPerturbarAberto] = useState(false);
  const [naoPerturbarData, setNaoPerturbarData] = useState("");

  const naoPerturbandoAgora = !!contact?.naoPerturbarAte && new Date(contact.naoPerturbarAte) > new Date();

  async function ativarNaoPerturbar() {
    if (!naoPerturbarData) return;
    setNaoPerturbarAberto(false);
    const res = await fetch(`/api/contacts/${contactId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ naoPerturbarAte: naoPerturbarData }),
    });
    const d = await res.json().catch(() => ({}));
    onChanged?.(d);
  }

  async function desativarNaoPerturbar() {
    const res = await fetch(`/api/contacts/${contactId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ naoPerturbarAte: null }),
    });
    const d = await res.json().catch(() => ({}));
    onChanged?.(d);
  }

  const load = useCallback(async () => {
    if (!contactId) return;
    const [t, n] = await Promise.all([
      fetch(`/api/contacts/${contactId}/tentativas`).then((r) => r.json()).catch(() => []),
      fetch(`/api/contacts/${contactId}/negociacoes`).then((r) => r.json()).catch(() => []),
    ]);
    setTentativas(Array.isArray(t) ? t : []);
    setNegociacoes(Array.isArray(n) ? n : []);
  }, [contactId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch("/api/config").then((r) => r.json()).then(setCfg).catch(() => {});
  }, []);

  const s = situacaoCobranca(contact, { descontoPct: cfg?.descontoPct });
  const qualifica =
    cfg?.descontoAtivo &&
    s.valorAberto > 0 &&
    s.diasAtraso != null &&
    s.diasAtraso >= (cfg?.descontoDiasMin ?? 15);

  async function copiarOferta() {
    const texto = interpolarVariaveis(cfg?.descontoMensagem || "", contact, { descontoPct: cfg?.descontoPct });
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {}
  }

  return (
    <div className="border border-slate-200 rounded-lg p-2.5">
      <div className="flex items-center justify-between text-xs font-medium text-slate-600">
        <span className="flex items-center gap-1"><Icone nome="cobranca" className="w-3.5 h-3.5" /> Cobrança</span>
        <div className="flex items-center gap-2">
          {s.valorAberto > 0 && (
            <button
              type="button"
              onClick={() => setAcordoAberto(true)}
              className="text-sky-600 hover:text-sky-700 font-normal"
            >
              + Acordo
            </button>
          )}
          <button
            type="button"
            onClick={() => setModalAberto(true)}
            className="text-sky-600 hover:text-sky-700 font-normal"
          >
            + Tentativa
          </button>
          <button
            type="button"
            onClick={naoPerturbandoAgora ? desativarNaoPerturbar : () => setNaoPerturbarAberto(true)}
            title="Pausa a cobrança automática deste lead até a data escolhida"
            className={naoPerturbandoAgora ? "text-amber-600 hover:text-amber-700 font-normal" : "text-slate-400 hover:text-slate-600 font-normal"}
          >
            {naoPerturbandoAgora ? "🔕 Não perturbe" : "Não perturbar"}
          </button>
        </div>
      </div>

      {naoPerturbandoAgora && (
        <p className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
          Cobrança automática pausada até {new Date(contact.naoPerturbarAte).toLocaleDateString("pt-BR")}.
        </p>
      )}

      {naoPerturbarAberto && (
        <div className="fixed inset-0 z-[60] bg-slate-900/40 flex items-center justify-center p-4" onClick={() => setNaoPerturbarAberto(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-800">Não perturbar até quando?</h3>
            <p className="text-[11px] text-slate-400">A régua e o lembrete automático param de mandar mensagem pra esse lead até essa data. Atendimento manual continua normal.</p>
            <input
              type="date" autoFocus
              value={naoPerturbarData}
              onChange={(e) => setNaoPerturbarData(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setNaoPerturbarAberto(false)} className="text-sm text-slate-500 px-3 py-1.5">Cancelar</button>
              <button disabled={!naoPerturbarData} onClick={ativarNaoPerturbar} className="text-sm bg-amber-500 text-white rounded-lg px-3.5 py-1.5 disabled:opacity-50">
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {contact?.scoreComportamental != null && (() => {
        const faixa = faixaComportamental(contact.scoreComportamental);
        const st = COR_COMPORT[faixa] || COR_COMPORT.regular;
        const lista = (contact.scoreComportMotivos || "").split("|").filter(Boolean);
        return (
          <div className={`mt-2 rounded-lg border p-2.5 ${st.fundo} ${st.borda}`}>
            <div className="flex items-center justify-between">
              <span className={`text-xs font-semibold ${st.texto}`}>{FAIXA_COMPORT_LABEL[faixa]}</span>
              <span className={`text-xs font-semibold ${st.texto}`}>{contact.scoreComportamental}/100</span>
            </div>
            <div className="w-full bg-white/70 rounded-full h-1.5 mt-1.5">
              <div className={`h-1.5 rounded-full ${st.barra}`} style={{ width: `${contact.scoreComportamental}%` }} />
            </div>
            {lista.length > 0 && (
              <ul className="mt-1.5 space-y-0.5">
                {lista.map((m, i) => (<li key={i} className="text-[10px] text-slate-500">• {m}</li>))}
              </ul>
            )}
            <p className="text-[10px] text-slate-400 mt-1.5">Baseado no histórico de pagamento nesta carteira.</p>
          </div>
        );
      })()}

      {qualifica && (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
          <p className="text-xs font-semibold text-amber-700">Quitação à vista disponível</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Em aberto {money(s.valorAberto)} · {s.diasAtraso} dias de atraso
          </p>
          <p className="text-sm font-semibold text-amber-700 mt-1">
            Quita por {money(s.valorQuitacao)} <span className="text-[11px] font-normal">(−{cfg.descontoPct}%)</span>
          </p>
          {cfg?.descontoMensagem ? (
            <button
              type="button"
              onClick={copiarOferta}
              className="mt-2 w-full text-xs border border-amber-300 text-amber-700 rounded-md py-1.5 hover:bg-amber-100 transition-colors"
            >
              {copiado ? "✓ Mensagem copiada" : "Copiar mensagem da oferta"}
            </button>
          ) : (
            <p className="text-[10px] text-slate-400 mt-1.5">
              Cadastre a mensagem em Configurações → Quitação à vista.
            </p>
          )}
        </div>
      )}

      {tentativas.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {tentativas.slice(0, 5).map((t) => (
            <li key={t.id} className="text-[11px] text-slate-500 flex items-start gap-1.5">
              <span className={`font-medium shrink-0 ${COR_RESULTADO[t.resultado] || "text-slate-500"}`}>
                {RESULTADO_LABEL[t.resultado] || t.resultado}
              </span>
              <span className="text-slate-400 truncate">
                · {TIPO_LABEL[t.tipo] || t.tipo} · {new Date(t.createdAt).toLocaleDateString("pt-BR")}
                {t.usuario ? ` · ${t.usuario}` : ""}
                {t.notas ? ` — ${t.notas}` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-slate-400 mt-2">Nenhuma tentativa de contato registrada.</p>
      )}

      {negociacoes.length > 0 && (
        <div className="mt-2 pt-2 border-t border-slate-100">
          <p className="text-[11px] font-medium text-slate-500 mb-1">Negociações ({negociacoes.length})</p>
          <ul className="space-y-1">
            {negociacoes.slice(0, 5).map((n) => (
              <li key={n.id} className="text-[11px] text-slate-500 flex items-start gap-1.5">
                <span className={`font-medium shrink-0 ${NEGOCIACAO_COR[n.tipo] || "text-slate-500"}`}>
                  {NEGOCIACAO_LABEL[n.tipo] || n.tipo}
                </span>
                <span className="text-slate-400 truncate">
                  {n.valorNegociado != null && `· ${money(n.valorNegociado)}`}
                  {n.parcelas ? ` em ${n.parcelas}x` : ""}
                  {" · "}{new Date(n.createdAt).toLocaleDateString("pt-BR")}
                  {n.usuario ? ` · ${n.usuario}` : ""}
                  {n.notas ? ` — ${n.notas}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {modalAberto && (
        <TentativaModal
          contactId={contactId}
          contactName={contact?.name}
          onClose={() => setModalAberto(false)}
          onSalvou={() => { setModalAberto(false); load(); }}
        />
      )}

      {acordoAberto && (
        <AcordoModal
          contactId={contactId}
          contactName={contact?.name}
          valorAberto={s.valorAberto}
          onClose={() => setAcordoAberto(false)}
          onSalvou={() => { setAcordoAberto(false); load(); onChanged?.(); }}
        />
      )}
    </div>
  );
}
