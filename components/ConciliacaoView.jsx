"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { planoBaixa, sugerirParcelas } from "@/lib/conciliacaoOfx";
import ContactModal from "./ContactModal";

const money = (n) => "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const quando = (d) => new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const dia = (d) => new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

function Cartao({ titulo, valor, cor, sub }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-4">
      <div className="text-xs text-slate-500">{titulo}</div>
      <div className={`text-2xl font-semibold mt-1 ${cor}`}>{valor}</div>
      {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function CabGrupo({ tipo, itens, valor }) {
  const ent = tipo === "entrada";
  return (
    <div className={`px-4 py-2 text-xs font-semibold flex items-center justify-between ${ent ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
      <span>{ent ? "Entradas" : "Saídas"} ({itens})</span>
      <span>{money(valor)}</span>
    </div>
  );
}

// Aba "Conciliação" de Lançamentos: sobe o OFX do dia, mostra o que não bateu e fecha o caixa.
export default function ConciliacaoView() {
  const [estado, setEstado] = useState(null);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [categorias, setCategorias] = useState([]);
  const [edicoes, setEdicoes] = useState({}); // id do movimento -> { descricao, categoriaId } (o que o gestor mudou antes de lançar)
  const [salvando, setSalvando] = useState(false);
  const arquivoRef = useRef(null);
  // Painel "cliente e parcelas" de uma entrada: { movId, busca, resultados, cliente, parcelas, marcadas:Set }
  const [vinc, setVinc] = useState(null);
  const [tipoFiltro, setTipoFiltro] = useState("todos"); // "todos" | "entrada" | "saida"
  const buscaTimer = useRef(null);
  const buscaSeq = useRef(0); // só a última busca digitada pode atualizar a lista (respostas antigas chegavam depois e a sobrescreviam)
  const [cardId, setCardId] = useState(null); // lead aberto para conferir se é o cliente certo

  async function novaCategoria(m, mudar) {
    const nome = window.prompt(`Nome da nova categoria de ${m.tipo === "entrada" ? "entrada" : "saída"}:`);
    if (!nome || !nome.trim()) return;
    const r = await fetch("/api/lancamentos/categorias", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: nome.trim(), type: m.tipo }) });
    if (!r.ok) { setErro("Não consegui criar a categoria."); return; }
    const lista = await fetch("/api/lancamentos/categorias").then((x) => x.json()).catch(() => []);
    setCategorias(Array.isArray(lista) ? lista : []);
    const criada = (Array.isArray(lista) ? lista : []).find((x) => x.name === nome.trim() && x.type === m.tipo);
    if (criada) mudar("categoriaId", criada.id);
  }

  function abrirVinculo(m) {
    setVinc(vinc?.movId === m.id ? null : { movId: m.id, busca: "", resultados: [], cliente: null, parcelas: [], marcadas: [] });
  }
  function digitarBusca(texto) {
    setVinc((v) => ({ ...v, busca: texto }));
    clearTimeout(buscaTimer.current);
    const minhaVez = ++buscaSeq.current;
    if (texto.trim().length < 3) { setVinc((v) => v && { ...v, resultados: [], buscando: false }); return; }
    setVinc((v) => v && { ...v, buscando: true });
    buscaTimer.current = setTimeout(async () => {
      const r = await fetch(`/api/lancamentos/conciliacao/cliente?q=${encodeURIComponent(texto.trim())}`).then((x) => x.json()).catch(() => []);
      if (minhaVez !== buscaSeq.current) return;
      setVinc((v) => v && { ...v, resultados: Array.isArray(r) ? r : [], buscando: false });
    }, 350);
  }
  async function escolherCliente(c, valor) {
    const r = await fetch(`/api/lancamentos/conciliacao/cliente?contactId=${c.id}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErro(j.error || "Não consegui abrir o cliente."); return; }
    setErro("");
    setVinc((v) => v && { ...v, cliente: j.cliente, parcelas: j.parcelas, resultados: [], marcadas: sugerirParcelas(j.parcelas, valor) });
  }
  function alternarParcela(id) {
    setVinc((v) => {
      const tem = v.marcadas.includes(id);
      return { ...v, marcadas: tem ? v.marcadas.filter((x) => x !== id) : [...v.marcadas, id] };
    });
  }
  async function baixarParcelas(m) {
    setSalvando(true);
    const r = await fetch(`/api/lancamentos/conciliacao/${m.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "baixar", contactId: vinc.cliente.id, parcelaIds: vinc.marcadas }) });
    const j = await r.json().catch(() => ({}));
    setSalvando(false);
    if (!r.ok) { setErro(j.error || "Não foi possível dar a baixa."); return; }
    setErro(""); setMsg(`Baixa dada em ${j.parcelas} parcela(s) de ${vinc.cliente.name} e conferida com o extrato.`); setVinc(null);
    carregar();
  }

  const carregar = useCallback(async () => {
    const r = await fetch("/api/lancamentos/conciliacao");
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErro(j.error || "Não consegui carregar."); return; }
    setErro("");
    setEstado(j);
  }, []);

  useEffect(() => {
    carregar();
    fetch("/api/lancamentos/categorias").then((r) => r.json()).then((c) => setCategorias(Array.isArray(c) ? c : [])).catch(() => {});
  }, [carregar]);

  async function enviar(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setEnviando(true); setMsg(""); setErro("");
    const fd = new FormData();
    fd.append("arquivo", f);
    const r = await fetch("/api/lancamentos/conciliacao", { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    setEnviando(false);
    if (arquivoRef.current) arquivoRef.current.value = "";
    if (!r.ok) { setErro(j.error || "Não consegui importar."); return; }
    setMsg(`${j.total} movimentos lidos (${j.novos} novos${j.repetidos ? `, ${j.repetidos} já importados` : ""}). ${j.casados} conferidos com os lançamentos${j.tarefasFechadas ? ` e ${j.tarefasFechadas} tarefa(s) de conferência fechada(s)` : ""}.`);
    carregar();
  }

  async function agir(id, corpo) {
    setSalvando(true);
    const r = await fetch(`/api/lancamentos/conciliacao/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    const j = await r.json().catch(() => ({}));
    setSalvando(false);
    if (!r.ok) { setErro(j.error || "Não foi possível."); return; }
    setErro("");
    carregar();
  }

  async function conferirManual(id) {
    const observacao = window.prompt("Como você conferiu? (ex.: pago em dinheiro, caiu em outra conta)") ;
    if (observacao === null) return;
    const r = await fetch("/api/lancamentos/conciliacao", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lancamentoId: id, observacao }) });
    if (r.ok) carregar(); else setErro("Não foi possível marcar.");
  }

  const c = estado?.caixa;
  const semArquivo = estado && !estado.importacoes?.length;

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-800">Extrato do banco (OFX)</div>
          <p className="text-xs text-slate-500 mt-0.5">Baixe o extrato do dia no app do banco em formato OFX e envie aqui. O sistema confere cada baixa com o dinheiro que entrou, e as saídas também.</p>
        </div>
        <label className={`shrink-0 text-center text-sm font-medium rounded-lg px-4 py-2 cursor-pointer transition-colors ${enviando ? "bg-slate-200 text-slate-500" : "bg-emerald-500 text-white hover:bg-emerald-600"}`}>
          {enviando ? "Conferindo..." : "Enviar OFX do dia"}
          <input ref={arquivoRef} type="file" accept=".ofx,.OFX,application/x-ofx,text/plain" className="hidden" disabled={enviando} onChange={enviar} />
        </label>
      </div>

      {estado?.caixa && (() => {
        const hojeBR = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
        const ontem = new Date(new Date(hojeBR + "T12:00:00Z").getTime() - 86400e3).toISOString().slice(0, 10);
        const ate = new Date(estado.caixa.periodo.ate).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
        return ate < ontem ? (
          <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            O extrato mais recente vai até {ate.split("-").reverse().join("/")}. Envie o extrato de {ontem.split("-").reverse().join("/")} (ontem) para conferir as baixas de lá.
          </div>
        ) : null;
      })()}

      {erro && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</div>}
      {msg && <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{msg}</div>}

      {semArquivo && <div className="text-sm text-slate-500 bg-white rounded-2xl border border-slate-200/70 p-6 text-center">Nenhum extrato enviado ainda. Envie o primeiro OFX para começar a conferir.</div>}

      {estado && !semArquivo && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Cartao titulo="Conferidos" valor={estado.resumo.conciliados} cor="text-emerald-600" sub="movimentos que bateram" />
            <Cartao titulo="No extrato, sem lançamento" valor={estado.resumo.pendentes} cor={estado.resumo.pendentes ? "text-red-600" : "text-slate-700"} sub="o gestor precisa lançar" />
            <Cartao titulo="Lançamento sem Pix" valor={estado.resumo.semExtrato} cor={estado.resumo.semExtrato ? "text-amber-600" : "text-slate-700"} sub="baixa que não achou no extrato" />
            <Cartao titulo="Em dinheiro" valor={estado.especie} cor="text-slate-700" sub="não passam pelo banco" />
          </div>

          {c && (
            <div className={`rounded-2xl border shadow-sm p-4 ${c.bate ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className={`text-sm font-semibold ${c.bate ? "text-emerald-700" : "text-red-700"}`}>
                  {c.bate ? "Caixa bate" : `Caixa não bate: diferença de ${money(Math.abs(c.difPeriodo))} no período`}
                </div>
                <div className="text-xs text-slate-500">Período do extrato: {dia(c.periodo.de)} a {dia(c.periodo.ate)}{c.ignorados ? ` · ${c.ignorados} ignorado(s)` : ""}</div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 text-sm">
                <div><div className="text-xs text-slate-500">Entradas (extrato × sistema)</div><div className="font-medium text-slate-800">{money(c.extEnt)} × {money(c.sisEnt)}</div><div className={`text-xs ${Math.abs(c.difEntradas) < 0.01 ? "text-slate-400" : "text-red-600"}`}>diferença {money(c.difEntradas)}</div></div>
                <div><div className="text-xs text-slate-500">Saídas (extrato × sistema)</div><div className="font-medium text-slate-800">{money(c.extSai)} × {money(c.sisSai)}</div><div className={`text-xs ${Math.abs(c.difSaidas) < 0.01 ? "text-slate-400" : "text-red-600"}`}>diferença {money(c.difSaidas)}</div></div>
                <div><div className="text-xs text-slate-500">Saldo final (extrato × sistema)</div><div className="font-medium text-slate-800">{c.saldoExtrato != null ? money(c.saldoExtrato) : "—"} × {c.saldoSistema != null ? money(c.saldoSistema) : "—"}</div>{c.difSaldo != null && <div className={`text-xs ${Math.abs(c.difSaldo) < 0.01 ? "text-slate-400" : "text-amber-600"}`}>diferença {money(c.difSaldo)} (inclui o que veio antes do 1º extrato)</div>}</div>
              </div>
            </div>
          )}

          {(() => {
            const n = (t) => estado.movPendentes.filter((x) => x.tipo === t).length + estado.lancSemExtrato.filter((x) => x.type === t).length;
            return (
              <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5 w-fit max-w-full overflow-x-auto">
                {[["todos", "Entradas e saídas", n("entrada") + n("saida")], ["entrada", "Só entradas", n("entrada")], ["saida", "Só saídas", n("saida")]].map(([k, rot, q]) => (
                  <button key={k} onClick={() => setTipoFiltro(k)} className={`text-xs px-3 py-1.5 rounded-md whitespace-nowrap transition-colors ${tipoFiltro === k ? "bg-white shadow-sm text-slate-700 font-medium" : "text-slate-500 hover:text-slate-700"}`}>{rot} ({q})</button>
                ))}
              </div>
            );
          })()}

          <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm">
            <div className="px-4 py-3 border-b border-slate-100 text-sm font-semibold text-slate-800">No extrato, sem lançamento ({estado.movPendentes.length})</div>
            {estado.movPendentes.filter((x) => tipoFiltro === "todos" || x.tipo === tipoFiltro).length === 0 && <div className="p-4 text-sm text-slate-400">{tipoFiltro === "entrada" ? "Nenhuma entrada sem lançamento." : tipoFiltro === "saida" ? "Nenhuma saída sem lançamento." : "Tudo que entrou e saiu da conta está lançado."}</div>}
            <div>
              {["entrada", "saida"].filter((t) => tipoFiltro === "todos" || tipoFiltro === t).map((tipoG) => {
              const grupo = estado.movPendentes.filter((x) => x.tipo === tipoG);
              if (!grupo.length) return null;
              return (
              <div key={tipoG}>
              {tipoFiltro === "todos" && <CabGrupo tipo={tipoG} itens={grupo.length} valor={grupo.reduce((a, x) => a + x.valor, 0)} />}
              <div className="divide-y divide-slate-100">
              {grupo.map((m) => {
                const candidatos = estado.lancSemExtrato.filter((l) => l.type === m.tipo && Math.abs(l.amount - m.valor) < 0.01);
                const ed = edicoes[m.id] || {};
                const descricao = ed.descricao ?? m.descricao ?? "";
                const categoriaId = ed.categoriaId ?? m.categoriaSugerida ?? "";
                const sugerida = !ed.categoriaId && !!m.categoriaSugerida;
                const mudar = (campo, v) => setEdicoes((e) => ({ ...e, [m.id]: { ...e[m.id], [campo]: v } }));
                return (
                  <div key={m.id} className="p-3 md:p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-medium rounded px-1.5 py-0.5 ${m.tipo === "entrada" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{m.tipo === "entrada" ? "Entrada" : "Saída"}</span>
                          <span className="font-semibold text-slate-800">{money(m.valor)}</span>
                          <span className="text-xs text-slate-400">{quando(m.data)}</span>
                        </div>
                        <div className="text-sm text-slate-600 mt-0.5 break-words">{m.descricao || "(sem descrição no extrato)"}</div>
                      </div>
                      <div className="flex gap-2 shrink-0 flex-wrap">
                        {m.tipo === "entrada" && <button disabled={salvando} onClick={() => abrirVinculo(m)} className="text-xs font-medium bg-sky-500 text-white rounded-lg px-3 py-1.5 hover:bg-sky-600">Cliente e parcelas</button>}
                        <button disabled={salvando} onClick={() => (categoriaId ? agir(m.id, { acao: "lancar", descricao, categoriaId }) : setErro("Escolha a categoria do lançamento antes de lançar."))} title={categoriaId ? "" : "Escolha a categoria"} className={`text-xs font-medium text-white rounded-lg px-3 py-1.5 ${categoriaId ? "bg-emerald-500 hover:bg-emerald-600" : "bg-slate-300"}`}>Lançar</button>
                        {candidatos.length > 0 && (
                          <select defaultValue="" onChange={(e) => e.target.value && agir(m.id, { acao: "vincular", lancamentoId: e.target.value })} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 max-w-[190px]">
                            <option value="">Vincular a lançamento…</option>
                            {candidatos.map((l) => <option key={l.id} value={l.id}>{dia(l.date)} · {l.contato || l.description || "sem descrição"}</option>)}
                          </select>
                        )}
                        <button disabled={salvando} onClick={() => { const o = window.prompt("Por que ignorar? (ex.: transferência entre minhas contas)"); if (o !== null) agir(m.id, { acao: "ignorar", observacao: o }); }} className="text-xs font-medium border border-slate-200 text-slate-600 rounded-lg px-3 py-1.5 hover:bg-slate-50">Ignorar</button>
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-[1fr_200px] gap-2">
                      <input value={descricao} onChange={(e) => mudar("descricao", e.target.value)} placeholder="Nome do lançamento (ex.: Venda de móvel, Aporte do sócio)" className="text-sm border border-slate-200 rounded-lg px-3 py-1.5" />
                      <select value={categoriaId} onChange={(e) => (e.target.value === "__nova" ? novaCategoria(m, mudar) : mudar("categoriaId", e.target.value))} className={`text-sm border rounded-lg px-2 py-1.5 ${categoriaId ? "border-slate-200" : "border-amber-300 bg-amber-50"}`}>
                        <option value="">Escolha a categoria…</option>
                        {categorias.filter((x) => x.type === m.tipo).map((x) => <option key={x.id} value={x.id}>{x.name}{sugerida && x.id === categoriaId ? " (usada antes)" : ""}</option>)}
                        <option value="__nova">+ Nova categoria…</option>
                      </select>
                    </div>
                    {vinc?.movId === m.id && (() => {
                      const sel = vinc.parcelas.filter((p) => vinc.marcadas.includes(p.id));
                      const plano = planoBaixa(sel, m.valor);
                      const aplicado = Math.round((m.valor - plano.sobra) * 100) / 100;
                      return (
                        <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50/50 p-3 space-y-2">
                          {!vinc.cliente ? (
                            <>
                              <input autoFocus value={vinc.busca} onChange={(e) => digitarBusca(e.target.value)} placeholder="Buscar cliente por nome ou telefone" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white" />
                              <div className="text-xs text-slate-400">Procura no nome, no telefone e dentro da conversa. Clique no nome para abrir o card e conferir.</div>
                              {vinc.buscando && <div className="text-xs text-slate-400">Buscando…</div>}
                              {vinc.resultados.map((c) => (
                                <div key={c.id} className="flex items-stretch gap-2">
                                  <button onClick={() => setCardId(c.id)} className="flex-1 min-w-0 text-left text-sm bg-white border border-slate-200 rounded-lg px-3 py-1.5 hover:border-sky-400">
                                    <div className="font-medium text-slate-800 truncate">{c.name} {!c.completo && <span className="text-[10px] font-normal text-amber-600">(parcial)</span>}</div>
                                    <div className="text-xs text-slate-400 truncate">{c.etapa}{c.phone ? ` · ${c.phone}` : ""}</div>
                                    {c.trecho && <div className="text-xs text-sky-700 mt-0.5 break-words">na conversa: “{c.trecho}”</div>}
                                  </button>
                                  <button onClick={() => escolherCliente(c, m.valor)} className="shrink-0 text-xs font-medium bg-sky-600 text-white rounded-lg px-3 hover:bg-sky-700">É ela(e)<br />Confirmar</button>
                                </div>
                              ))}
                              {!vinc.buscando && vinc.busca.trim().length >= 3 && vinc.resultados.length === 0 && <div className="text-xs text-slate-400">Nenhum cliente encontrado.</div>}
                            </>
                          ) : (
                            <>
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-sm font-medium text-slate-800">{vinc.cliente.name}</div>
                                <button onClick={() => setVinc({ ...vinc, cliente: null, parcelas: [], marcadas: [] })} className="text-xs text-slate-500 underline">trocar cliente</button>
                              </div>
                              {vinc.parcelas.length === 0 && <div className="text-xs text-slate-500">Esse cliente não tem parcelas em aberto no ciclo atual.</div>}
                              <div className="space-y-1">
                                {vinc.parcelas.map((p) => (
                                  <label key={p.id} className="flex items-center gap-2 text-sm bg-white border border-slate-200 rounded-lg px-3 py-1.5 cursor-pointer">
                                    <input type="checkbox" checked={vinc.marcadas.includes(p.id)} onChange={() => alternarParcela(p.id)} />
                                    <span className="flex-1">Parcela {p.number}ª · vence {new Date(p.dueDate).toLocaleDateString("pt-BR", { timeZone: "UTC" })}</span>
                                    <span className="text-slate-700">{money(p.amount - p.valorPago)}</span>
                                    {p.devido > p.amount + 0.01 && <span className="text-xs text-red-600">com multa {money(p.devido - p.valorPago)}</span>}
                                  </label>
                                ))}
                              </div>
                              <div className={`text-xs ${plano.sobra > 0.01 ? "text-red-600" : "text-slate-600"}`}>
                                Pix de {money(m.valor)} · aplicado nas parcelas marcadas: {money(aplicado)}{plano.sobra > 0.01 ? ` · sobram ${money(plano.sobra)}: marque mais parcelas` : plano.itens.some((i) => i.semJuros) ? " · quitando sem multa" : ""}
                              </div>
                              <button disabled={salvando || !sel.length || plano.sobra > 0.01} onClick={() => baixarParcelas(m)} className="text-sm font-medium bg-sky-600 text-white rounded-lg px-4 py-2 hover:bg-sky-700 disabled:opacity-40">Dar baixa nas parcelas marcadas</button>
                            </>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
              </div>
              </div>
              );
              })}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm">
            <div className="px-4 py-3 border-b border-slate-100 text-sm font-semibold text-slate-800">Lançamentos sem Pix no extrato ({estado.lancSemExtrato.length})</div>
            {estado.lancSemExtrato.filter((x) => tipoFiltro === "todos" || x.type === tipoFiltro).length === 0 && <div className="p-4 text-sm text-slate-400">{tipoFiltro === "todos" ? "Todos os lançamentos do período foram achados no extrato." : "Nada nesse filtro."}</div>}
            <div>
              {["entrada", "saida"].filter((t) => tipoFiltro === "todos" || tipoFiltro === t).map((tipoG) => {
              const grupo = estado.lancSemExtrato.filter((x) => x.type === tipoG);
              if (!grupo.length) return null;
              return (
              <div key={tipoG}>
              {tipoFiltro === "todos" && <CabGrupo tipo={tipoG} itens={grupo.length} valor={grupo.reduce((a, x) => a + x.amount, 0)} />}
              <div className="divide-y divide-slate-100">
              {grupo.map((l) => (
                <div key={l.id} className="p-3 md:p-4 flex flex-col sm:flex-row sm:items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium rounded px-1.5 py-0.5 ${l.type === "entrada" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{l.type === "entrada" ? "Entrada" : "Saída"}</span>
                      <span className="font-semibold text-slate-800">{money(l.amount)}</span>
                      <span className="text-xs text-slate-400">{quando(l.date)}</span>
                    </div>
                    <div className="text-sm text-slate-600 mt-0.5 break-words">{l.contato ? `${l.contato} — ` : ""}{l.description || "(sem descrição)"}</div>
                  </div>
                  <button onClick={() => conferirManual(l.id)} className="shrink-0 text-xs font-medium border border-slate-200 text-slate-600 rounded-lg px-3 py-1.5 hover:bg-slate-50">Conferido à mão</button>
                </div>
              ))}
              </div>
              </div>
              );
              })}
            </div>
          </div>

          <div className="text-xs text-slate-400">
            Últimos arquivos: {estado.importacoes.slice(0, 5).map((i) => `${i.arquivo || "OFX"} (${dia(i.de)}–${dia(i.ate)}, ${i.qtdMov} mov.)`).join(" · ")}
          </div>
        </>
      )}
      {cardId && <ContactModal contactId={cardId} onClose={() => setCardId(null)} onChanged={() => {}} />}
    </div>
  );
}
