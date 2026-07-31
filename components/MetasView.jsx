"use client";

import { useEffect, useState, useCallback } from "react";
import ContactModal from "@/components/ContactModal";
import Icone from "@/components/Icones";
import { Grafico30Dias, CalendarioMes, PlacarEquipe, Sequencia } from "@/components/MetasGraficos";
import { baixarCsv, numeroCsv } from "@/lib/exportar";

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
    amber: "text-amber-600",
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

const NIVEL_BARRA = { abaixo: "bg-red-500", minima: "bg-amber-500", media: "bg-sky-500", meta: "bg-emerald-500" };
const NIVEL_TEXTO = { abaixo: "text-red-600", minima: "text-amber-600", media: "text-sky-600", meta: "text-emerald-600" };
const NIVEL_LABEL = { abaixo: "Abaixo da mínima", minima: "Bateu a mínima", media: "Bateu a média", meta: "Meta cheia batida!" };

// % que ainda falta pra alcançar um limiar — null quando já foi alcançado.
function pctFalta(atual, limiar) {
  if (limiar <= 0 || atual >= limiar) return null;
  return Math.round(((limiar - atual) / limiar) * 100);
}

// Barra com marcadores de mínima/média. `fmt` permite usar a mesma barra pra
// quantidade (3 vendas) e pra dinheiro (R$ 1.200,00).
function NivelBar({ atual, minima, media, meta, nivel, unidade, unidadePlural, fmt }) {
  if (!meta) {
    return <p className="text-xs text-slate-400">Meta não configurada.</p>;
  }
  const f = fmt || ((v) => v);
  const max = Math.max(meta, atual, 1);
  const nv = nivel || "abaixo";
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
        <div className={`h-3 rounded-full transition-all ${NIVEL_BARRA[nv]}`} style={{ width: `${pct}%` }} />
        <div className="absolute top-0 bottom-0 w-0.5 bg-slate-400/60" style={{ left: `${posMinima}%` }} title={`Mínima: ${f(minima)}`} />
        <div className="absolute top-0 bottom-0 w-0.5 bg-slate-400/60" style={{ left: `${posMedia}%` }} title={`Média: ${f(media)}`} />
      </div>
      <div className="flex items-center justify-between mt-1.5 text-[10px] text-slate-400">
        <span>Mínima {f(minima)}</span>
        <span>Média {f(media)}</span>
        <span>Meta {f(meta)}</span>
      </div>
      <p className={`flex items-center gap-1 text-xs font-medium mt-2 ${NIVEL_TEXTO[nv]}`}>
        {NIVEL_LABEL[nv]} {nv === "meta" && <Icone nome="trofeu" className="w-3.5 h-3.5" />}
      </p>
      {faltaPctMinima != null && <p className="text-xs text-red-500 mt-0.5">Faltam {faltaPctMinima}% pra mínima</p>}
      {faltaPctMedia != null && <p className="text-xs text-amber-500 mt-0.5">Faltam {faltaPctMedia}% pra média</p>}
      {faltaMeta > 0 && (
        <p className="text-xs text-slate-400 mt-0.5">
          {unidade ? `Faltam ${f(faltaMeta)} ${faltaMeta === 1 ? unidade : plural} pra meta cheia.` : `Faltam ${f(faltaMeta)} pra meta cheia.`}
        </p>
      )}
    </div>
  );
}

// Modal genérico de lista — vendas fechadas e recebimentos do dia.
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

/* --------- 1. Acumulado do mês --------- */
// A cor sai por style e não por classe: `bg-${cor}-500` é montado em tempo de
// execução e o Tailwind, que varre o código como texto, não geraria esse CSS.
function BarraMes({ label, atual, meta, fmt, cor = "#10b981" }) {
  const f = fmt || ((v) => v);
  const pct = meta > 0 ? Math.min(100, Math.round((atual / meta) * 100)) : null;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-slate-500">{label}</span>
        <span className="text-xs text-slate-400 shrink-0">
          {f(atual)}{meta > 0 && <> <span className="text-slate-300">/</span> {f(meta)}</>}
        </span>
      </div>
      <div className="w-full bg-slate-100 rounded-full h-2 mt-1">
        <div
          className="h-2 rounded-full transition-all"
          style={{ width: `${pct ?? 0}%`, background: pct == null ? "#cbd5e1" : cor }}
        />
      </div>
      <p className="text-[10px] text-slate-400 mt-0.5">
        {pct == null ? "sem meta registrada nos dias já corridos" : `${pct}% da meta acumulada`}
      </p>
    </div>
  );
}

/* ---------------- 119. Comparar dois períodos lado a lado ---------------- */
function ComparativoPeriodos({ usuario }) {
  const [aberto, setAberto] = useState(false);
  const hoje = hojeStr();
  const seteDiasAtras = (() => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toLocaleDateString("en-CA"); })();
  const quatorzeDiasAtras = (() => { const d = new Date(); d.setDate(d.getDate() - 14); return d.toLocaleDateString("en-CA"); })();
  const [de1, setDe1] = useState(seteDiasAtras);
  const [ate1, setAte1] = useState(hoje);
  const [de2, setDe2] = useState(quatorzeDiasAtras);
  const [ate2, setAte2] = useState(seteDiasAtras);
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(false);

  async function comparar() {
    setLoading(true);
    const qs = new URLSearchParams({ de1, ate1, de2, ate2 });
    if (usuario) qs.set("usuario", usuario);
    const d = await fetch(`/api/metas/comparar?${qs}`).then((r) => r.json()).catch(() => null);
    setDados(d?.periodo1 ? d : null);
    setLoading(false);
  }

  const LINHAS = [
    ["Vendas", "vendas", (v) => v],
    ["Capital liberado", "valorVendido", money],
    ["Clientes que pagaram", "recebimentos", (v) => v],
    ["Baixas de parcela", "baixas", (v) => v],
    ["Valor recebido", "valorRecebido", money],
    ["Recuperado de atrasados", "valorRecuperado", money],
  ];

  return (
    <section className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5">
      <button type="button" onClick={() => setAberto((a) => !a)} className="w-full flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-800">Comparar dois períodos</h2>
        <span className="text-slate-300">{aberto ? "▲" : "▼"}</span>
      </button>
      {aberto && (
        <div className="mt-4 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1">Período A</p>
              <div className="flex items-center gap-1.5">
                <input type="date" value={de1} max={hoje} onChange={(e) => setDe1(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5" />
                <span className="text-xs text-slate-400">até</span>
                <input type="date" value={ate1} max={hoje} onChange={(e) => setAte1(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5" />
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1">Período B</p>
              <div className="flex items-center gap-1.5">
                <input type="date" value={de2} max={hoje} onChange={(e) => setDe2(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5" />
                <span className="text-xs text-slate-400">até</span>
                <input type="date" value={ate2} max={hoje} onChange={(e) => setAte2(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5" />
              </div>
            </div>
          </div>
          <button type="button" onClick={comparar} disabled={loading} className="text-xs bg-emerald-500 text-white rounded-lg px-3 py-1.5 hover:bg-emerald-600 disabled:opacity-50">
            {loading ? "Comparando…" : "Comparar"}
          </button>

          {dados && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-400 border-b border-slate-100">
                    <th className="text-left font-medium py-1.5">Indicador</th>
                    <th className="text-right font-medium py-1.5">A ({dados.periodo1.dias}d)</th>
                    <th className="text-right font-medium py-1.5">B ({dados.periodo2.dias}d)</th>
                    <th className="text-right font-medium py-1.5">Diferença</th>
                  </tr>
                </thead>
                <tbody>
                  {LINHAS.map(([label, campo, fmt]) => {
                    const a = dados.periodo1[campo] || 0;
                    const b = dados.periodo2[campo] || 0;
                    const dif = b !== 0 ? Math.round(((a - b) / b) * 100) : a > 0 ? 100 : 0;
                    return (
                      <tr key={campo} className="border-b border-slate-50 last:border-0">
                        <td className="py-2 text-slate-600">{label}</td>
                        <td className="py-2 text-right tabular-nums">{fmt(a)}</td>
                        <td className="py-2 text-right tabular-nums text-slate-400">{fmt(b)}</td>
                        <td className={`py-2 text-right tabular-nums font-medium ${dif >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                          {dif >= 0 ? "+" : ""}{dif}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default function MetasView() {
  const [resumo, setResumo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openContactId, setOpenContactId] = useState(null);
  const [modalVendas, setModalVendas] = useState(false);
  const [modalRecebimentos, setModalRecebimentos] = useState(false);
  const [dia, setDia] = useState(hojeStr());
  const [usuario, setUsuario] = useState("");   // "" = total da empresa
  const [equipe, setEquipe] = useState("");     // item 117: recorte por equipe (id)
  const [pessoas, setPessoas] = useState([]);
  const [equipes, setEquipes] = useState([]);

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ dia });
    if (equipe) qs.set("equipe", equipe);
    else if (usuario) qs.set("usuario", usuario);
    const data = await fetch(`/api/metas/resumo?${qs}`).then((r) => r.json()).catch(() => null);
    setResumo(data);
    setLoading(false);
  }, [dia, usuario, equipe]);

  useEffect(() => {
    load();
    // Só fica atualizando sozinho no dia de hoje — dia passado não muda mais.
    if (dia !== hojeStr()) return;
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load, dia]);

  useEffect(() => {
    fetch("/api/users").then((r) => r.json()).then((u) => setPessoas(Array.isArray(u) ? u : [])).catch(() => {});
    fetch("/api/equipes").then((r) => r.json()).then((e) => setEquipes(Array.isArray(e) ? e : [])).catch(() => {});
  }, []);

  // Um único select cobre os três recortes: "" empresa, "u:Nome" pessoa, "e:id" equipe.
  const recorteValor = equipe ? `e:${equipe}` : usuario ? `u:${usuario}` : "";
  function mudarRecorte(v) {
    if (v.startsWith("e:")) { setEquipe(v.slice(2)); setUsuario(""); }
    else if (v.startsWith("u:")) { setUsuario(v.slice(2)); setEquipe(""); }
    else { setUsuario(""); setEquipe(""); }
    setLoading(true);
  }

  function mudarDia(offset) {
    const d = new Date(dia + "T00:00:00.000Z");
    d.setUTCDate(d.getUTCDate() + offset);
    const novo = d.toISOString().slice(0, 10);
    // Não deixa navegar pro futuro: não existe meta de dia que não aconteceu.
    if (novo > hojeStr()) return;
    setDia(novo);
    setLoading(true);
  }

  function irPara(novoDia) {
    if (!novoDia || novoDia > hojeStr()) return;
    setDia(novoDia);
    setLoading(true);
  }

  if (loading) return <div className="p-6 text-slate-400">Carregando metas…</div>;
  if (!resumo) return <div className="p-6 text-slate-400">Não foi possível carregar as metas.</div>;

  const r = resumo;
  const ehHoje = r.dia === hojeStr();
  const mes = r.mes || {};
  const proj = r.projecao || {};
  const med = r.mediaMesmoDiaSemana;

  const cmp = (atual, media) => {
    if (media == null || media === 0) return null;
    const dif = Math.round(((atual - media) / media) * 100);
    return { dif, melhor: dif >= 0 };
  };

  return (
    <div className="flex-1 overflow-y-auto thin-scroll p-3 md:p-6 flex flex-col gap-4 md:gap-6">
      {/* -------- Cabeçalho: dia + recorte por pessoa -------- */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg font-semibold text-slate-800">Metas</h1>

          <div className="flex flex-wrap items-center gap-2">
            {r.podeVerTotal && (
              <select
                value={recorteValor}
                onChange={(e) => mudarRecorte(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white outline-none focus:border-emerald-400"
              >
                <option value="">Empresa (total)</option>
                {equipes.length > 0 && (
                  <optgroup label="Equipes">
                    {equipes.map((eq) => (<option key={eq.id} value={`e:${eq.id}`}>{eq.nome}</option>))}
                  </optgroup>
                )}
                <optgroup label="Pessoas">
                  {pessoas.map((p) => (<option key={p.id} value={`u:${p.name}`}>{p.name}</option>))}
                </optgroup>
              </select>
            )}

            <div className="flex items-center gap-1">
              <button
                onClick={() => mudarDia(-1)}
                title="Dia anterior"
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-emerald-600 hover:border-emerald-300"
              >
                <Icone nome="seta" className="w-3.5 h-3.5 rotate-90" />
              </button>
              <input
                type="date"
                value={dia}
                max={hojeStr()}
                onChange={(e) => irPara(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white outline-none focus:border-emerald-400"
              />
              <button
                onClick={() => mudarDia(1)}
                disabled={ehHoje}
                title="Próximo dia"
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-emerald-600 hover:border-emerald-300 disabled:opacity-40 disabled:hover:text-slate-500 disabled:hover:border-slate-200"
              >
                <Icone nome="seta" className="w-3.5 h-3.5 -rotate-90" />
              </button>
              {!ehHoje && (
                <button onClick={() => irPara(hojeStr())} className="text-xs text-emerald-600 hover:underline ml-1">
                  Hoje
                </button>
              )}
            </div>
          </div>
        </div>

        <p className="text-sm text-slate-500 mt-1">
          {fmtDiaLongo(r.dia)}
          {r.equipeNome && <> · <strong className="text-slate-600">Equipe {r.equipeNome}</strong></>}
          {!r.equipeNome && usuario && <> · <strong className="text-slate-600">{usuario}</strong></>}
          {" · "}Regra: <strong>{r.metaPctRecebimento}%</strong> de {(usuario || r.equipeNome) ? "quem é dele(a)" : "todos os leads"} em Recebimento
          {" "}({(usuario || r.equipeNome) ? r.carteiraDoUsuario ?? 0 : r.totalEmRecebimento} lead{((usuario || r.equipeNome) ? r.carteiraDoUsuario ?? 0 : r.totalEmRecebimento) === 1 ? "" : "s"})
          <a href="/configuracoes?tab=metas" className="text-emerald-600 hover:underline ml-1">Configurar</a>
        </p>

        {r.baseMetaAproximada && (
          <p className="flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mt-2">
            <Icone nome="alerta" className="w-3.5 h-3.5 shrink-0 mt-px" />
            Este dia é anterior ao registro automático de metas, então a meta de recebimento foi recalculada
            sobre a carteira de hoje — o resultado (o que foi vendido e recebido) é exato.
          </p>
        )}
        {r.metaVendasPropria && (
          <p className="text-[11px] text-sky-600 mt-1.5">
            Usando a meta de vendas {r.equipeNome ? `da equipe ${r.equipeNome}` : `individual de ${usuario}`}.
          </p>
        )}
      </div>

      {/* -------- Metas do dia -------- */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-6 items-start">
        <button
          type="button"
          onClick={() => setModalVendas(true)}
          title="Ver as vendas fechadas neste dia"
          className="text-left bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5 hover:border-emerald-300 transition-colors"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-slate-700">Vendas {ehHoje ? "hoje" : "no dia"}</p>
            <p className="text-sm text-slate-500">{r.vendasHoje} / {r.metaVendasDia}</p>
          </div>
          <NivelBar
            atual={r.vendasHoje}
            minima={r.metaVendasMinima}
            media={r.metaVendasMedia}
            meta={r.metaVendasDia}
            nivel={r.niveis?.vendas}
            unidade="venda"
          />
          <p className="text-[11px] text-emerald-600 mt-2">Clique para ver as vendas fechadas →</p>
        </button>

        <button
          type="button"
          onClick={() => setModalRecebimentos(true)}
          title="Ver o que foi recebido neste dia"
          className="text-left bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5 hover:border-emerald-300 transition-colors"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-slate-700">Recebimentos ({r.metaPctRecebimento}%)</p>
            <p className="text-sm text-slate-500">{r.recebimentosHoje} / {r.metaRecebimentosDia} clientes</p>
          </div>
          <NivelBar
            atual={r.recebimentosHoje}
            minima={r.metaRecebimentosMinima}
            media={r.metaRecebimentosMedia}
            meta={r.metaRecebimentosDia}
            nivel={r.niveis?.recebimentos}
            unidade="cliente"
            unidadePlural="clientes"
          />
          <p className="text-[11px] text-slate-400 mt-2">
            Conta <strong>clientes distintos</strong> que pagaram — quem quita 2 dias de uma vez conta 1 aqui e 2 nas baixas.
          </p>
          <p className="text-[11px] text-emerald-600 mt-1.5">Clique para ver o que foi recebido →</p>
        </button>

        {/* 5. Meta de vendas em R$ */}
        {r.metaValorVendasDia > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-slate-700">Capital liberado</p>
              <p className="text-sm text-slate-500">{money(r.valorVendidoHoje)}</p>
            </div>
            <NivelBar
              atual={r.valorVendidoHoje}
              minima={r.metaValorVendasMinima}
              media={r.metaValorVendasMedia}
              meta={r.metaValorVendasDia}
              nivel={r.niveis?.valorVendas}
              fmt={money}
            />
            <p className="text-[11px] text-slate-400 mt-2">
              Meta em dinheiro, não em quantidade: 3 empréstimos de R$300 e 3 de R$900 contam igual na meta de vendas.
            </p>
          </div>
        )}

        {/* 3. Recuperação de atrasados */}
        <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-slate-700">Recuperação de atrasados</p>
            <p className="text-sm text-amber-600 font-medium">{money(r.valorRecuperadoHoje)}</p>
          </div>
          {r.metaRecuperacaoDia > 0 ? (
            <NivelBar
              atual={r.valorRecuperadoHoje}
              minima={r.metaRecuperacaoMinima}
              media={r.metaRecuperacaoMedia}
              meta={r.metaRecuperacaoDia}
              nivel={r.niveis?.recuperacao}
              fmt={money}
            />
          ) : (
            <p className="text-xs text-slate-400">
              Meta não configurada. Defina em Configurações → Metas pra acompanhar separado.
            </p>
          )}
          <p className="text-[11px] text-slate-400 mt-2">
            Só o que entrou de parcela paga <strong>depois do vencimento</strong> — é o esforço de cobrar quem já atrasou,
            que a meta de recebimento normal não separa.
          </p>
        </div>
      </div>

      {/* -------- Números do dia -------- */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <Card titulo="Baixas de parcela" valor={r.baixasHoje} sub={`${r.recebimentosHoje} cliente${r.recebimentosHoje === 1 ? "" : "s"} distinto${r.recebimentosHoje === 1 ? "" : "s"}`} cor="emerald" />
        <Card titulo="Valor recebido" valor={money(r.valorRecebidoHoje)} cor="emerald" />
        <Card titulo="Capital liberado" valor={money(r.valorVendidoHoje)} sub={`${r.vendasHoje} venda${r.vendasHoje === 1 ? "" : "s"}`} cor="violet" />
        <Card titulo="Carteira em Recebimento" valor={(usuario || r.equipeNome) ? r.carteiraDoUsuario ?? 0 : r.totalEmRecebimento} sub="Base do cálculo da meta" cor="sky" />
      </div>

      {/* -------- 7 e 8: comparativo e projeção -------- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 7. Mesmo dia da semana */}
        <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-4">
          <h2 className="text-sm font-semibold text-slate-800 mb-1">Comparado com o mesmo dia da semana</h2>
          {!med ? (
            <p className="text-xs text-slate-400 mt-2">Ainda sem histórico suficiente pra comparar.</p>
          ) : (
            <>
              <p className="text-[11px] text-slate-400 mb-2">
                Média das últimas {med.amostras} ocorrência{med.amostras === 1 ? "" : "s"} — sábado rende diferente de terça,
                comparar com a média geral seria injusto.
              </p>
              <ul className="space-y-1.5">
                {[
                  ["Recebido", r.valorRecebidoHoje, med.valorRecebido, money],
                  ["Recuperado", r.valorRecuperadoHoje, med.valorRecuperado, money],
                  ["Vendas", r.vendasHoje, med.vendas, (v) => v],
                ].map(([label, atual, media, f]) => {
                  const c = cmp(atual, media);
                  return (
                    <li key={label} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-slate-500">{label}</span>
                      <span className="flex items-center gap-1.5 shrink-0">
                        <span className="text-slate-400">méd. {f(media)}</span>
                        {c && (
                          <span className={`font-medium ${c.melhor ? "text-emerald-600" : "text-red-500"}`}>
                            {c.melhor ? "+" : ""}{c.dif}%
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        {/* 8. Projeção */}
        <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-4">
          <h2 className="text-sm font-semibold text-slate-800 mb-1">Projeção</h2>
          {!proj.dia && !proj.mes ? (
            <p className="text-xs text-slate-400 mt-2">Sem base pra projetar ainda.</p>
          ) : (
            <div className="space-y-3">
              {proj.dia && (
                <div>
                  <p className="text-[11px] text-slate-400">
                    Fechamento de hoje no ritmo atual ({proj.dia.fracaoDoDia}% do expediente)
                  </p>
                  <p className="text-sm font-semibold text-slate-700 mt-0.5">
                    {money(proj.dia.valorRecebido)} <span className="font-normal text-slate-400">recebido</span>
                  </p>
                  <p className="text-xs text-slate-500">{proj.dia.vendas} venda(s)</p>
                </div>
              )}
              {proj.mes && (
                <div className={proj.dia ? "pt-2 border-t border-slate-100" : ""}>
                  <p className="text-[11px] text-slate-400">
                    Fechamento do mês ({proj.mes.diasUteisRestantes} dia{proj.mes.diasUteisRestantes === 1 ? "" : "s"} útil(eis) restante(s))
                  </p>
                  <p className="text-sm font-semibold text-slate-700 mt-0.5">
                    {money(proj.mes.valorRecebido)} <span className="font-normal text-slate-400">recebido</span>
                  </p>
                  <p className="text-xs text-slate-500">{proj.mes.vendas} venda(s) no mês</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 10. Sequência */}
        <Sequencia seq={r.sequencia} />
      </div>

      {/* -------- 1. Acumulado do mês -------- */}
      <section className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <h2 className="text-sm font-semibold text-slate-800">Acumulado do mês</h2>
          <p className="text-[11px] text-slate-400">
            {mes.diasUteisCorridos} dia(s) útil(eis) corrido(s) · meta somada de {mes.diasComMeta} dia(s) registrado(s)
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <BarraMes label="Vendas" atual={mes.vendas} meta={mes.metaVendas} />
          <BarraMes label="Clientes que pagaram (baixas)" atual={mes.baixas} meta={mes.metaRecebimentos} />
          <BarraMes label="Recuperado de atrasados" atual={mes.valorRecuperado} meta={mes.metaRecuperacao} fmt={money} />
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs text-slate-500">Recebido no mês</span>
            </div>
            <p className="text-lg font-bold text-emerald-600 mt-1">{money(mes.valorRecebido)}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Capital liberado: {money(mes.valorVendido)}</p>
          </div>
        </div>
      </section>

      {/* -------- 4 e 9: gráfico e calendário -------- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 items-start">
        <div>
          <div className="flex justify-end mb-1.5">
            {/* 122. Exportar histórico de metas (últimos 30 dias visíveis no gráfico) */}
            <button
              type="button"
              onClick={() => baixarCsv("historico-metas", [
                { label: "Dia", chave: "dia" },
                { label: "Vendas", chave: "vendas" },
                { label: "Meta vendas", chave: "metaVendasDia" },
                { label: "Capital liberado", valor: (d) => numeroCsv(d.valorVendido) },
                { label: "Clientes que pagaram", chave: "recebimentos" },
                { label: "Meta clientes", chave: "metaRecebimentosDia" },
                { label: "Baixas de parcela", chave: "baixas" },
                { label: "Valor recebido", valor: (d) => numeroCsv(d.valorRecebido) },
                { label: "Valor recuperado", valor: (d) => numeroCsv(d.valorRecuperado) },
                { label: "Tem meta registrada", valor: (d) => (d.temMeta ? "sim" : "não") },
              ], r.serie30 || [])}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-emerald-600"
            >
              <Icone nome="baixar" className="w-3 h-3" /> Exportar CSV
            </button>
          </div>
          <Grafico30Dias serie={r.serie30 || []} onDia={irPara} />
        </div>
        <CalendarioMes serie={r.calendarioMes || []} diaAtual={r.dia} onDia={irPara} />
      </div>

      {/* -------- 6. Placar por pessoa (só na visão total) -------- */}
      {!usuario && r.placar && (
        <PlacarEquipe placar={r.placar} onUsuario={(nome) => { setUsuario(nome); setLoading(true); }} />
      )}

      <ComparativoPeriodos usuario={usuario} />

      {modalVendas && (
        <ListaModal
          titulo="Vendas fechadas"
          itens={r.vendasDetalhe || []}
          vazio="Nenhuma venda fechada neste dia."
          onClose={() => setModalVendas(false)}
          onAbrirContato={(id) => { setModalVendas(false); setOpenContactId(id); }}
          renderItem={(v) => (
            <>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-700 truncate">{v.nome || "Sem nome"}</p>
                <p className="text-xs text-slate-400 truncate">
                  {v.phone || "sem telefone"} · {fmtHora(v.entrouRecebimentoEm)}
                  {v.responsavel && <> · {v.responsavel}</>}
                </p>
              </div>
              <span className="text-sm font-medium text-emerald-600 shrink-0">{money(v.valorCapital)}</span>
            </>
          )}
        />
      )}

      {modalRecebimentos && (
        <ListaModal
          titulo="Recebido"
          itens={r.baixasDetalhe || []}
          vazio="Nenhuma baixa registrada neste dia."
          onClose={() => setModalRecebimentos(false)}
          onAbrirContato={(id) => { setModalRecebimentos(false); setOpenContactId(id); }}
          renderItem={(b) => (
            <>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-700 truncate">
                  {b.nome || "Sem nome"}
                  {b.atrasada && (
                    <span className="ml-1.5 text-[10px] font-semibold text-amber-600 bg-amber-50 rounded-full px-1.5 py-0.5">
                      recuperado
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-400 truncate">
                  {b.phone || "sem telefone"} · Parcela {b.parcela}ª · {fmtHora(b.paidAt)}
                  {b.baixadoPor && <> · {b.baixadoPor}</>}
                </p>
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
