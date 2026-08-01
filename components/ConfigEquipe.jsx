"use client";

import { useCallback, useEffect, useState } from "react";
import Icone from "@/components/Icones";

const money = (n) => "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDia = (d) => new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" });

/* ---------------- 32. Controle de espécie ---------------- */
function EspecieConfig() {
  const [dados, setDados] = useState(null);
  const load = useCallback(() => fetch("/api/especie").then((r) => r.json()).then(setDados).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  if (!dados) return <p className="text-sm text-slate-400">Carregando…</p>;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5">
      <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5 mb-1"><Icone nome="dinheiro" className="w-4 h-4" /> Dinheiro em espécie com o cobrador</h3>
      <p className="text-[11px] text-slate-400 mb-3">Nasce sozinho quando uma baixa é dada como "Dinheiro em espécie" na ficha do lead. Baixa risco de dinheiro sumir sem ninguém saber.</p>
      {dados.saldos.length === 0 ? (
        <p className="text-xs text-slate-400">Nenhuma baixa em espécie registrada ainda.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-400 border-b border-slate-100">
              <th className="text-left font-medium py-1.5">Pessoa</th>
              <th className="text-right font-medium py-1.5">Recebido</th>
              <th className="text-right font-medium py-1.5">Depositado</th>
              <th className="text-right font-medium py-1.5">Em mãos agora</th>
            </tr>
          </thead>
          <tbody>
            {dados.saldos.map((s) => (
              <tr key={s.usuario} className="border-b border-slate-50 last:border-0">
                <td className="py-2">{s.usuario}</td>
                <td className="py-2 text-right text-slate-500">{money(s.recebido)}</td>
                <td className="py-2 text-right text-slate-500">{money(s.depositado)}</td>
                <td className={`py-2 text-right font-semibold ${s.saldo > 0 ? "text-amber-600" : "text-slate-400"}`}>{money(s.saldo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ---------------- 38. Prestação de contas diária (visão admin) ---------------- */
function PrestacaoContasAdmin() {
  const [lista, setLista] = useState([]);
  useEffect(() => {
    fetch("/api/prestacao-contas").then((r) => r.json()).then((d) => setLista(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5">
      <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5 mb-1"><Icone nome="documento" className="w-4 h-4" /> Prestação de contas do dia</h3>
      <p className="text-[11px] text-slate-400 mb-3">O relato que cada cobrador preenche ao encerrar o dia — não substitui os números reais do sistema, é o que ele mesmo diz ter feito.</p>
      {lista.length === 0 ? (
        <p className="text-xs text-slate-400">Ninguém preencheu ainda.</p>
      ) : (
        <ul className="divide-y divide-slate-50 max-h-72 overflow-y-auto thin-scroll">
          {lista.map((p) => (
            <li key={p.id} className="py-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-700">{p.usuario}</span>
                <span className="text-slate-400">{fmtDia(p.dia)}</span>
              </div>
              <p className="text-slate-500 mt-0.5">
                {p.visitas != null && <>Visitas: {p.visitas} · </>}
                {p.recebidoDinheiro != null && <>Dinheiro: {money(p.recebidoDinheiro)} · </>}
                {p.recebidoPix != null && <>Pix: {money(p.recebidoPix)}</>}
              </p>
              {p.observacao && <p className="text-slate-400 mt-0.5">"{p.observacao}"</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------------- 37. Fechamento semanal de comissão ---------------- */
function ComissaoFechamentos() {
  const [lista, setLista] = useState([]);
  const [gerando, setGerando] = useState(false);
  const load = useCallback(() => fetch("/api/comissao/fechamentos").then((r) => r.json()).then((d) => setLista(Array.isArray(d) ? d : [])).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);

  async function gerar() {
    setGerando(true);
    await fetch("/api/comissao/fechamentos", { method: "POST" });
    setGerando(false);
    load();
  }

  async function mudarStatus(id, status) {
    const res = await fetch(`/api/comissao/fechamentos/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    });
    if (res.ok) load();
  }

  const STATUS_COR = { pendente: "bg-amber-50 text-amber-700", aprovado: "bg-sky-50 text-sky-700", pago: "bg-emerald-50 text-emerald-700" };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5"><Icone nome="carteira" className="w-4 h-4" /> Fechamento semanal de comissão</h3>
        <button onClick={gerar} disabled={gerando} className="text-xs bg-slate-800 text-white rounded-lg px-2.5 py-1.5 hover:bg-slate-700 disabled:opacity-50">
          {gerando ? "Gerando…" : "Fechar semana anterior"}
        </button>
      </div>
      <p className="text-[11px] text-slate-400 mb-3">Fecha sozinho todo domingo — o botão é só pra forçar fora do horário. Aprovar antes de marcar como pago.</p>
      {lista.length === 0 ? (
        <p className="text-xs text-slate-400">Nenhum fechamento ainda.</p>
      ) : (
        <ul className="divide-y divide-slate-50">
          {lista.map((f) => (
            <li key={f.id} className="py-2.5 flex items-center justify-between gap-2 flex-wrap">
              <div>
                <p className="text-sm text-slate-700">{f.usuario} <span className="text-slate-400 font-normal">— semana de {fmtDia(f.semanaInicio)}</span></p>
                <p className="text-[11px] text-slate-400">
                  Recuperou {money(f.valorRecuperado)} · {f.diasBatidos} dia(s) de meta batida{f.bateuSemanal ? " · bateu a semanal" : ""}
                  {f.bonusProgressivo > 0 && <> · +{money(f.bonusProgressivo)} progressivo</>}
                  {f.descontoPerdas > 0 && <> · -{money(f.descontoPerdas)} ({f.qtdPerdas} perda{f.qtdPerdas === 1 ? "" : "s"})</>}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-semibold text-slate-700">{money(f.valorTotal)}</span>
                <span className={`text-[10px] rounded-full px-2 py-0.5 font-medium ${STATUS_COR[f.status]}`}>{f.status}</span>
                {f.status === "pendente" && (
                  <button onClick={() => mudarStatus(f.id, "aprovado")} className="text-xs text-sky-600 hover:text-sky-700">Aprovar</button>
                )}
                {f.status === "aprovado" && (
                  <button onClick={() => mudarStatus(f.id, "pago")} className="text-xs text-emerald-600 hover:text-emerald-700">Marcar pago</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------------- 117. Equipes (metas em grupo) ---------------- */
function EquipesConfig() {
  const [equipes, setEquipes] = useState([]);
  const [users, setUsers] = useState([]);
  const [nomeNovo, setNomeNovo] = useState("");
  const [abertaId, setAbertaId] = useState(null);
  const [form, setForm] = useState({});
  const [salvando, setSalvando] = useState(false);

  const load = useCallback(() => {
    fetch("/api/equipes").then((r) => r.json()).then((d) => setEquipes(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);
  useEffect(load, [load]);
  useEffect(() => {
    fetch("/api/users").then((r) => r.json()).then((d) => setUsers(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  async function criar(e) {
    e.preventDefault();
    if (!nomeNovo.trim()) return;
    const res = await fetch("/api/equipes", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: nomeNovo.trim() }),
    });
    if (res.ok) { setNomeNovo(""); load(); }
  }

  function abrir(eq) {
    setAbertaId(abertaId === eq.id ? null : eq.id);
    setForm({
      metaVendasMinima: eq.metaVendasMinima ?? "",
      metaVendasMedia: eq.metaVendasMedia ?? "",
      metaVendasDia: eq.metaVendasDia ?? "",
      metaPctRecebimentoMinima: eq.metaPctRecebimentoMinima ?? "",
      metaPctRecebimentoMedia: eq.metaPctRecebimentoMedia ?? "",
      metaPctRecebimento: eq.metaPctRecebimento ?? "",
      membrosIds: eq.membros.map((m) => m.id),
    });
  }

  async function salvar(id) {
    setSalvando(true);
    await fetch(`/api/equipes/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    setSalvando(false);
    setAbertaId(null);
    load();
  }

  async function excluir(id) {
    if (!confirm("Excluir esta equipe? Os usuários ficam sem equipe.")) return;
    await fetch(`/api/equipes/${id}`, { method: "DELETE" });
    load();
  }

  function toggleMembro(uid) {
    setForm((f) => ({
      ...f,
      membrosIds: f.membrosIds.includes(uid) ? f.membrosIds.filter((x) => x !== uid) : [...f.membrosIds, uid],
    }));
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5">
      <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5 mb-1"><Icone nome="pessoas" className="w-4 h-4" /> Equipes</h3>
      <p className="text-[11px] text-slate-400 mb-3">
        Agrupe usuários pra acompanhar meta em conjunto (na tela de Metas, escolha a equipe em vez de "toda a empresa" ou uma pessoa). Deixe os campos de meta vazios pra usar a meta global.
      </p>
      <form onSubmit={criar} className="flex gap-2 mb-3">
        <input
          value={nomeNovo}
          onChange={(e) => setNomeNovo(e.target.value)}
          placeholder="Nome da nova equipe"
          className="flex-1 text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400"
        />
        <button className="text-xs bg-emerald-500 text-white rounded-lg px-3 py-2 hover:bg-emerald-600">+ Criar</button>
      </form>
      <ul className="space-y-2">
        {equipes.map((eq) => (
          <li key={eq.id} className="border border-slate-100 rounded-xl">
            <button onClick={() => abrir(eq)} className="w-full flex items-center justify-between px-3 py-2.5 text-left">
              <div>
                <p className="text-sm font-medium text-slate-700">{eq.nome}</p>
                <p className="text-[11px] text-slate-400">{eq.membros.length} membro(s)</p>
              </div>
              <span className="text-slate-300">{abertaId === eq.id ? "▲" : "▼"}</span>
            </button>
            {abertaId === eq.id && (
              <div className="px-3 pb-3 space-y-3 border-t border-slate-100 pt-3">
                <div>
                  <p className="text-xs text-slate-500 mb-1.5">Meta de vendas do dia (vazio = meta global)</p>
                  <div className="grid grid-cols-3 gap-2">
                    <input type="number" min={0} placeholder="Mínima" value={form.metaVendasMinima} onChange={(e) => setForm((f) => ({ ...f, metaVendasMinima: e.target.value }))} className="text-sm border border-slate-200 rounded-lg px-2 py-1.5" />
                    <input type="number" min={0} placeholder="Média" value={form.metaVendasMedia} onChange={(e) => setForm((f) => ({ ...f, metaVendasMedia: e.target.value }))} className="text-sm border border-slate-200 rounded-lg px-2 py-1.5" />
                    <input type="number" min={0} placeholder="Meta" value={form.metaVendasDia} onChange={(e) => setForm((f) => ({ ...f, metaVendasDia: e.target.value }))} className="text-sm border border-slate-200 rounded-lg px-2 py-1.5" />
                  </div>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1.5">Meta de recebimento (% da carteira, vazio = meta global)</p>
                  <div className="grid grid-cols-3 gap-2">
                    <input type="number" min={0} max={100} placeholder="Mínima %" value={form.metaPctRecebimentoMinima} onChange={(e) => setForm((f) => ({ ...f, metaPctRecebimentoMinima: e.target.value }))} className="text-sm border border-slate-200 rounded-lg px-2 py-1.5" />
                    <input type="number" min={0} max={100} placeholder="Média %" value={form.metaPctRecebimentoMedia} onChange={(e) => setForm((f) => ({ ...f, metaPctRecebimentoMedia: e.target.value }))} className="text-sm border border-slate-200 rounded-lg px-2 py-1.5" />
                    <input type="number" min={0} max={100} placeholder="Meta %" value={form.metaPctRecebimento} onChange={(e) => setForm((f) => ({ ...f, metaPctRecebimento: e.target.value }))} className="text-sm border border-slate-200 rounded-lg px-2 py-1.5" />
                  </div>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1.5">Membros</p>
                  <div className="flex flex-wrap gap-1.5">
                    {users.map((u) => (
                      <button
                        type="button"
                        key={u.id}
                        onClick={() => toggleMembro(u.id)}
                        className={`text-xs rounded-full px-2.5 py-1 border ${form.membrosIds?.includes(u.id) ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "border-slate-200 text-slate-500"}`}
                      >
                        {u.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button type="button" disabled={salvando} onClick={() => salvar(eq.id)} className="text-xs bg-emerald-500 text-white rounded-lg px-3 py-1.5 hover:bg-emerald-600 disabled:opacity-50">
                    {salvando ? "Salvando…" : "Salvar"}
                  </button>
                  <button type="button" onClick={() => excluir(eq.id)} className="text-xs text-red-400 hover:text-red-600">Excluir equipe</button>
                </div>
              </div>
            )}
          </li>
        ))}
        {equipes.length === 0 && <li className="py-6 text-center text-sm text-slate-400">Nenhuma equipe criada ainda.</li>}
      </ul>
    </div>
  );
}

/* ---------------- 185. Transferir carteira entre cobradores ---------------- */
function TransferirCarteira() {
  const [users, setUsers] = useState([]);
  const [de, setDe] = useState("");
  const [para, setPara] = useState("");
  const [apenasEmRecebimento, setApenasEmRecebimento] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/users").then((r) => r.json()).then((d) => setUsers(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  async function transferir() {
    if (!de || !para || de === para) return;
    if (!confirm(`Transferir ${apenasEmRecebimento ? "os leads em Recebimento" : "todos os leads"} de ${de} para ${para}?`)) return;
    setEnviando(true);
    setMsg("");
    const res = await fetch("/api/usuarios/transferir-carteira", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ de, para, apenasEmRecebimento }),
    });
    const d = await res.json().catch(() => ({}));
    setEnviando(false);
    if (!res.ok) { setMsg(d.error || "Erro ao transferir."); return; }
    setMsg(`${d.transferidos} lead(s) transferido(s) de ${de} para ${para}.`);
    setDe(""); setPara("");
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5">
      <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5 mb-1"><Icone nome="pessoas" className="w-4 h-4" /> Transferir carteira</h3>
      <p className="text-[11px] text-slate-400 mb-3">Passa de uma vez todos os leads de um cobrador/vendedor pra outro — usado quando alguém sai da equipe ou troca de função.</p>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <label className="block">
          <span className="text-xs text-slate-500">De</span>
          <select value={de} onChange={(e) => setDe(e.target.value)} className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white outline-none focus:border-emerald-400">
            <option value="">Selecione…</option>
            {users.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-slate-500">Para</span>
          <select value={para} onChange={(e) => setPara(e.target.value)} className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white outline-none focus:border-emerald-400">
            <option value="">Selecione…</option>
            {users.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}
          </select>
        </label>
      </div>
      <label className="flex items-center gap-2 text-xs text-slate-500 mb-3">
        <input type="checkbox" checked={apenasEmRecebimento} onChange={(e) => setApenasEmRecebimento(e.target.checked)} />
        Só os leads que já estão em "Recebimento" (deixa vendas/negociação em aberto como estão)
      </label>
      {msg && <p className="text-xs text-emerald-600 mb-2">{msg}</p>}
      <button disabled={enviando || !de || !para} onClick={transferir} className="text-xs bg-slate-800 text-white rounded-lg px-3 py-1.5 hover:bg-slate-700 disabled:opacity-50">
        {enviando ? "Transferindo…" : "Transferir"}
      </button>
    </div>
  );
}

export default function ConfigEquipe() {
  return (
    <div className="space-y-4 max-w-2xl">
      <TransferirCarteira />
      <EquipesConfig />
      <EspecieConfig />
      <ComissaoFechamentos />
      <PrestacaoContasAdmin />
    </div>
  );
}
