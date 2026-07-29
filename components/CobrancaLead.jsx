"use client";

import { useCallback, useEffect, useState } from "react";
import { interpolarVariaveis, situacaoCobranca } from "@/lib/variaveis";
import TentativaModal, { RESULTADO_LABEL, TIPO_LABEL } from "@/components/TentativaModal";
import { faixaComportamental, FAIXA_COMPORT_LABEL } from "@/lib/scoreComportamental";

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
export default function CobrancaLead({ contactId, contact }) {
  const [cfg, setCfg] = useState(null);
  const [tentativas, setTentativas] = useState([]);
  const [modalAberto, setModalAberto] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const load = useCallback(async () => {
    if (!contactId) return;
    const d = await fetch(`/api/contacts/${contactId}/tentativas`).then((r) => r.json()).catch(() => []);
    setTentativas(Array.isArray(d) ? d : []);
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
        <span>📞 Cobrança</span>
        <button
          type="button"
          onClick={() => setModalAberto(true)}
          className="text-sky-600 hover:text-sky-700 font-normal"
        >
          + Tentativa
        </button>
      </div>

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

      {modalAberto && (
        <TentativaModal
          contactId={contactId}
          contactName={contact?.name}
          onClose={() => setModalAberto(false)}
          onSalvou={() => { setModalAberto(false); load(); }}
        />
      )}
    </div>
  );
}
