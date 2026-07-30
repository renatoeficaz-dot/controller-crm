"use client";

import { useEffect, useState, useCallback } from "react";
import ContactModal from "@/components/ContactModal";
import Icone from "@/components/Icones";

function fmtHora(iso) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

const money = (n) =>
  "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const hojeStr = () => new Date().toLocaleDateString("en-CA");

// "2026-07-28" -> "terça-feira, 28/07/2026". Interpreta como UTC pra não perder
// um dia por causa do fuso.
function fmtDiaLongo(iso) {
  const d = new Date(iso + "T00:00:00.000Z");
  const semana = d.toLocaleDateString("pt-BR", { weekday: "long", timeZone: "UTC" });
  const data = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
  return `${semana}, ${data}`;
}

function Card({ titulo, valor, sub, cor = "slate" }) {
  const cores = {
    emerald: "text-emerald-600",
    sky: "text-sky-600",
    violet: "text-violet-600",
    red: "text-red-600",
    slate: "text-slate-700",
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5">
      <p className="text-xs text-slate-400">{titulo}</p>
      <p className={`text-2xl font-bold mt-1 ${cores[cor] || cores.slate}`}>{valor}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

// Nível atingido hoje, dos 3 configurados: abaixo da mínima, na mínima,
// na média, ou meta cheia batida.
function nivelDe(atual, minima, media, meta) {
  if (atual >= meta) return "meta";
  if (atual >= media) return "media";
  if (atual >= minima) return "minima";
  return "abaixo";
}

const NIVEL_BARRA = { abaixo: "bg-red-500", minima: "bg-amber-500", media: "bg-sky-500", meta: "bg-emerald-500" };
const NIVEL_TEXTO = { abaixo: "text-red-600", minima: "text-amber-600", media: "text-sky-600", meta: "text-emerald-600" };
const NIVEL_LABEL = { abaixo: "Abaixo da mínima", minima: "Bateu a mínima", media: "Bateu a média", meta: "Meta cheia batida!" };

// % que ainda falta pra alcançar um limiar (mínima/média), em pontos
// percentuais do próprio limiar — null quando já foi alcançado.
function pctFalta(atual, limiar) {
  if (limiar <= 0 || atual >= limiar) return null;
  return Math.round(((limiar - atual) / limiar) * 100);
}

// Barra de progresso com marcadores de mínima/média, cor muda conforme o
// nível atingido no dia.
function NivelBar({ atual, minima, media, meta, unidade, unidadePlural }) {
  const max = Math.max(meta, atual, 1);
  const nivel = nivelDe(atual, minima, media, meta);
  const pct = Math.min(100, Math.round((atual / max) * 100));
  const posMinima = Math.min(100, Math.round((minima / max) * 100));
  const posMedia = Math.min(100, Math.round((media / max) * 100));
  const faltaMeta = Math.max(0, meta - atual);
  const plural = unidadePlural || `${unidade}s`;
  const faltaPctMinima = pctFalta(atual, minima);
  const faltaPctMedia = pctFalta(atual, media);

  return (
    <div>
      <div className="relative w-full bg-slate-100 rounded-full h-3">
        <div className={`h-3 rounded-full transition-all ${NIVEL_BARRA[nivel]}`} style={{ width: `${pct}%` }} />
        <div className="absolute top-0 bottom-0 w-0.5 bg-slate-400/60" style={{ left: `${posMinima}%` }} title={`Mínima: ${minima}`} />
        <div className="absolute top-0 bottom-0 w-0.5 bg-slate-400/60" style={{ left: `${posMedia}%` }} title={`Média: ${media}`} />
      </div>
      <div className="flex items-center justify-between mt-1.5 text-[10px] text-slate-400">
        <span>Mínima {minima}</span>
        <span>Média {media}</span>
        <span>Meta {meta}</span>
      </div>
      <p className={`flex items-center gap-1 text-xs font-medium mt-2 ${NIVEL_TEXTO[nivel]}`}>
        {NIVEL_LABEL[nivel]} {nivel === "meta" && <Icone nome="trofeu" className="w-3.5 h-3.5" />}
      </p>
      {faltaPctMinima != null && <p className="text-xs text-red-500 mt-0.5">Faltam {faltaPctMinima}% pra mínima</p>}
      {faltaPctMedia != null && <p className="text-xs text-amber-500 mt-0.5">Faltam {faltaPctMedia}% pra média</p>}
      {faltaMeta > 0 && (
        <p className="text-xs text-slate-400 mt-0.5">
          Faltam {faltaMeta} {faltaMeta === 1 ? unidade : plural} pra meta cheia.
        </p>
      )}
    </div>
  );
}

// Modal genérico de lista — usado tanto pras vendas fechadas hoje quanto pros
// recebimentos de hoje, pra não duplicar o esqueleto (backdrop, header, vazio).
function ListaModal({ titulo, itens, vazio, onClose, onAbrirContato, renderItem }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto thin-scroll"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
          <h3 className="font-semibold text-slate-800">
            {titulo} <span className="text-slate-400 font-normal">({itens.length})</span>
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
        <div className="p-5">
          {itens.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">{vazio}</p>
          ) : (
            <ul className="divide-y divide-slate-50">
              {itens.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onAbrirContato(item.contactId)}
                    className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-slate-50/80 transition-colors rounded-lg px-1.5 -mx-1.5"
                  >
                    {renderItem(item)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MetasView() {
  const [resumo, setResumo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openContactId, setOpenContactId] = useState(null);
  const [modalVendas, setModalVendas] = useState(false);
  const [modalRecebimentos, setModalRecebimentos] = useState(false);
  const [dia, setDia] = useState(hojeStr());

  const load = useCallback(async () => {
    const data = await fetch(`/api/metas/resumo?dia=${dia}`).then((r) => r.json()).catch(() => null);
    setResumo(data);
    setLoading(false);
  }, [dia]);

  useEffect(() => {
    load();
    // Só fica atualizando sozinho no dia de hoje — dia passado não muda mais.
    if (dia !== hojeStr()) return;
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load, dia]);

  function mudarDia(offset) {
    const d = new Date(dia + "T00:00:00.000Z");
    d.setUTCDate(d.getUTCDate() + offset);
    const novo = d.toISOString().slice(0, 10);
    // Não deixa navegar pro futuro: não existe meta de dia que não aconteceu.
    if (novo > hojeStr()) return;
    setDia(novo);
    setLoading(true);
  }

  if (loading) return <div className="p-6 text-slate-400">Carregando metas…</div>;
  if (!resumo) return <div className="p-6 text-slate-400">Não foi possível carregar as metas.</div>;

  return (
    <div className="flex-1 overflow-y-auto thin-scroll p-3 md:p-6 grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-6 items-start">
      <div className="xl:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg font-semibold text-slate-800">Metas</h1>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => mudarDia(-1)}
              title="Dia anterior"
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:border-emerald-300 hover:text-emerald-600 transition-colors"
            >
              <Icone nome="seta" className="w-4 h-4 rotate-90" />
            </button>
            <input
              type="date"
              value={dia}
              max={hojeStr()}
              onChange={(e) => { if (e.target.value) { setDia(e.target.value); setLoading(true); } }}
              className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white outline-none focus:border-emerald-400"
            />
            <button
              type="button"
              onClick={() => mudarDia(1)}
              disabled={dia >= hojeStr()}
              title="Dia seguinte"
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:border-emerald-300 hover:text-emerald-600 disabled:opacity-40 disabled:hover:border-slate-200 transition-colors"
            >
              <Icone nome="seta" className="w-4 h-4 -rotate-90" />
            </button>
            {dia !== hojeStr() && (
              <button
                type="button"
                onClick={() => { setDia(hojeStr()); setLoading(true); }}
                className="text-xs text-emerald-600 hover:underline ml-1"
              >
                Hoje
              </button>
            )}
          </div>
        </div>

        <p className="text-sm text-slate-500 mt-1">
          {resumo.ehHoje ? "Metas de hoje" : `Metas de ${fmtDiaLongo(resumo.dia)}`}. Regra atual:{" "}
          <strong>{resumo.metaPctRecebimento}%</strong> de todos os leads que estão na etapa Recebimento precisam
          pagar no dia (mínima {resumo.metaPctRecebimentoMinima}%, média {resumo.metaPctRecebimentoMedia}%).
          <a href="/configuracoes?tab=metas" className="text-emerald-600 hover:underline ml-1">Configurar</a>
        </p>

        {resumo.baseMetaAproximada && (
          <p className="flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5 mt-2">
            <Icone nome="alerta" className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              O que <strong>foi recebido e vendido</strong> neste dia é histórico real. Já a <strong>meta</strong> de
              recebimento é recalculada sobre a carteira de hoje ({resumo.totalEmRecebimento} leads em Recebimento) —
              o sistema não guarda o tamanho que a carteira tinha naquele dia, então trate a meta como referência.
            </span>
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={() => setModalVendas(true)}
        title="Ver as vendas fechadas neste dia"
        className="text-left bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5 hover:border-emerald-300 transition-colors"
      >
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold text-slate-700">Vendas {resumo.ehHoje ? "hoje" : "no dia"}</p>
          <p className="text-sm text-slate-500">{resumo.vendasHoje} / {resumo.metaVendasDia}</p>
        </div>
        <NivelBar
          atual={resumo.vendasHoje}
          minima={resumo.metaVendasMinima}
          media={resumo.metaVendasMedia}
          meta={resumo.metaVendasDia}
          unidade="venda"
        />
        <p className="text-[11px] text-emerald-600 mt-2">Clique para ver as vendas fechadas →</p>
      </button>

      <Card
        titulo="Leads atualmente em Recebimento"
        valor={resumo.totalEmRecebimento}
        sub="Base do cálculo da meta de recebimento (situação de agora)"
        cor="violet"
      />

      <button
        type="button"
        onClick={() => setModalRecebimentos(true)}
        title="Ver o que foi recebido neste dia"
        className="text-left bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5 xl:col-span-2 hover:border-emerald-300 transition-colors"
      >
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold text-slate-700">Recebimentos {resumo.ehHoje ? "hoje" : "no dia"} ({resumo.metaPctRecebimento}%)</p>
          <p className="text-sm text-slate-500">
            {resumo.recebimentosHoje} / {resumo.metaRecebimentosHoje} clientes
          </p>
        </div>
        <NivelBar
          atual={resumo.recebimentosHoje}
          minima={resumo.metaRecebimentosMinima}
          media={resumo.metaRecebimentosMedia}
          meta={resumo.metaRecebimentosHoje}
          unidade="cliente"
          unidadePlural="clientes"
        />
        <p className="text-[11px] text-slate-400 mt-2">
          A meta conta <strong>clientes distintos</strong> que pagaram, não o número de parcelas — se um cliente
          quitar 2 dias de atraso de uma vez, conta como 1 aqui (mas como 2 nas baixas).
        </p>
        <p className="text-[11px] text-emerald-600 mt-2">Clique para ver o que foi recebido →</p>
      </button>

      <Card
        titulo={`Baixas de parcela ${resumo.ehHoje ? "hoje" : "no dia"}`}
        valor={resumo.baixasHoje}
        sub={`${resumo.recebimentosHoje} cliente${resumo.recebimentosHoje === 1 ? "" : "s"} distinto${resumo.recebimentosHoje === 1 ? "" : "s"}`}
        cor="emerald"
      />
      <Card titulo={`Valor recebido ${resumo.ehHoje ? "hoje" : "no dia"}`} valor={money(resumo.valorRecebidoHoje)} cor="emerald" />

      {modalVendas && (
        <ListaModal
          titulo={resumo.ehHoje ? "Vendas fechadas hoje" : `Vendas fechadas em ${fmtDiaLongo(resumo.dia)}`}
          itens={resumo.vendasDetalhe || []}
          vazio={resumo.ehHoje ? "Nenhuma venda fechada hoje ainda." : "Nenhuma venda fechada neste dia."}
          onClose={() => setModalVendas(false)}
          onAbrirContato={(id) => { setModalVendas(false); setOpenContactId(id); }}
          renderItem={(v) => (
            <>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-700 truncate">{v.nome || "Sem nome"}</p>
                <p className="text-xs text-slate-400 truncate">{v.phone || "sem telefone"} · {fmtHora(v.entrouRecebimentoEm)}</p>
              </div>
              <span className="text-sm font-medium text-emerald-600 shrink-0">{money(v.valorCapital)}</span>
            </>
          )}
        />
      )}

      {modalRecebimentos && (
        <ListaModal
          titulo={resumo.ehHoje ? "Recebido hoje" : `Recebido em ${fmtDiaLongo(resumo.dia)}`}
          itens={resumo.baixasDetalhe || []}
          vazio={resumo.ehHoje ? "Nenhuma baixa registrada hoje ainda." : "Nenhuma baixa registrada neste dia."}
          onClose={() => setModalRecebimentos(false)}
          onAbrirContato={(id) => { setModalRecebimentos(false); setOpenContactId(id); }}
          renderItem={(b) => (
            <>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-700 truncate">{b.nome || "Sem nome"}</p>
                <p className="text-xs text-slate-400 truncate">{b.phone || "sem telefone"} · Parcela {b.parcela}ª · {fmtHora(b.paidAt)}</p>
              </div>
              <span className="text-sm font-medium text-emerald-600 shrink-0">{money(b.valor)}</span>
            </>
          )}
        />
      )}

      {openContactId && (
        <ContactModal
          contactId={openContactId}
          onClose={() => setOpenContactId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
