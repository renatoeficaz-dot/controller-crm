"use client";

import { useCallback, useEffect, useState } from "react";
import Icone from "@/components/Icones";

const money = (n) => "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDia = (d) => new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" });

/* ---------------- 32. Controle de espécie ---------------- */
function EspecieConfig() {
  const [dados, setDados] = useState(null);
  const load = useCallback(() => fetch("/api/especie").then((r) => r.json()).then(setDados).catch(() => {}), []);
  useEffect(load, [load]);
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
  useEffect(load, [load]);

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

export default function ConfigEquipe() {
  return (
    <div className="space-y-4 max-w-2xl">
      <EspecieConfig />
      <ComissaoFechamentos />
      <PrestacaoContasAdmin />
    </div>
  );
}
