"use client";

import { useEffect, useState } from "react";
import Secao from "@/components/SecaoColapsavel";

// Ligações pela Hasos por dia (feitas, atendidas, tempo falado, recebidas), por número e por colaborador.
// Em Relatórios recebe o período do filtro (ini/fim); em Configurações escolhe o período aqui mesmo.
const hojeBR = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const menosDias = (s, n) => new Date(new Date(s + "T12:00:00Z").getTime() - n * 86400e3).toISOString().slice(0, 10);
const diaCurto = (s) => {
  const d = new Date(s + "T12:00:00Z");
  const sem = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][d.getUTCDay()];
  return `${sem} ${s.slice(8, 10)}/${s.slice(5, 7)}`;
};
const tempo = (seg) => {
  if (!seg) return "—";
  const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), s = seg % 60;
  return h ? `${h}h${String(m).padStart(2, "0")}` : m ? `${m}min${s ? ` ${s}s` : ""}` : `${s}s`;
};

const PERIODOS = [
  { k: "7", rotulo: "7 dias" },
  { k: "30", rotulo: "30 dias" },
  { k: "mes", rotulo: "Este mês" },
];

export default function LigacoesHasos({ ini: iniProp, fim: fimProp, titulo = "Ligações pela Hasos (por dia)", aberta = false }) {
  const proprio = !iniProp || !fimProp;
  const [periodo, setPeriodo] = useState("30");
  const hoje = hojeBR();
  const ini = proprio ? (periodo === "mes" ? hoje.slice(0, 8) + "01" : menosDias(hoje, Number(periodo) - 1)) : iniProp;
  const fim = proprio ? hoje : fimProp;

  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    fetch(`/api/relatorios/ligacoes-hasos?${new URLSearchParams({ ini, fim })}`)
      .then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => null) }))
      .then(({ ok, d }) => {
        if (!vivo) return;
        if (!ok) { setErro(d?.error || "Não foi possível carregar as ligações."); setDados(null); return; } // sem os números do período anterior
        setErro(""); setDados(d);
      })
      .catch(() => vivo && setErro("Não foi possível carregar as ligações."))
      .finally(() => vivo && setCarregando(false));
    return () => { vivo = false; };
  }, [ini, fim]);

  const t = dados?.total;
  const dias = dados?.dias || [];
  const max = Math.max(1, ...dias.map((d) => Math.max(d.feitas, d.recebidas)));

  return (
    <Secao titulo={titulo} aberta={aberta}>
      <div className="flex flex-col gap-4">
        {proprio && (
          <div className="flex gap-1.5 flex-wrap">
            {PERIODOS.map((p) => (
              <button
                key={p.k}
                type="button"
                onClick={() => setPeriodo(p.k)}
                className={`px-3 py-1.5 rounded-lg text-xs border ${periodo === p.k ? "bg-brand text-white border-brand" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
              >
                {p.rotulo}
              </button>
            ))}
          </div>
        )}

        {erro && <p className="text-sm text-red-500">{erro}</p>}
        {dados?.erroSync && <p className="text-xs text-amber-600">Não consegui atualizar com a Hasos agora ({dados.erroSync}). Mostrando o que já estava salvo.</p>}
        {!dados && !erro && <p className="text-sm text-slate-400">Carregando…</p>}

        {t && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Card rotulo="Ligações feitas" valor={t.feitas} sub={`${(dias.length ? t.feitas / dias.length : 0).toFixed(1).replace(".", ",")} por dia com ligação`} cor="text-brand" />
              <Card rotulo="Atendidas (com conversa)" valor={t.atendidas} sub={t.feitas ? `${Math.round((t.atendidas / t.feitas) * 100)}% das feitas` : "—"} cor="text-accent" />
              <Card rotulo="Tempo falado" valor={tempo(t.segundos)} sub="nas ligações feitas" />
              <Card rotulo="Recebidas" valor={t.recebidas} sub={t.falhas ? `${t.falhas} clique(s) em Ligar que falharam` : "ligações de clientes"} />
            </div>

            {dias.length === 0 ? (
              <p className="text-sm text-slate-400">Nenhuma ligação pela Hasos neste período.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm min-w-[620px]">
                  <thead className="bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="py-2 px-3 text-left font-medium">Dia</th>
                      <th className="py-2 px-3 text-right font-medium">Feitas</th>
                      <th className="py-2 px-3 text-right font-medium">Atendidas</th>
                      <th className="py-2 px-3 text-right font-medium">Tempo falado</th>
                      <th className="py-2 px-3 text-right font-medium">Recebidas</th>
                      <th className="py-2 px-3 text-left font-medium w-[34%]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {dias.map((d) => (
                      <tr key={d.dia} className="border-t border-slate-100">
                        <td className="py-2 px-3 text-slate-700 whitespace-nowrap">{diaCurto(d.dia)}{d.dia === hoje ? " (hoje)" : ""}</td>
                        <td className="py-2 px-3 text-right tabular-nums font-semibold text-brand">{d.feitas}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-accent">{d.atendidas}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-slate-600">{tempo(d.segundos)}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-slate-600">{d.recebidas}{d.falhas ? <span className="text-red-500 text-xs"> · {d.falhas} falha(s)</span> : null}</td>
                        <td className="py-2 px-3">
                          <div className="flex flex-col gap-1">
                            <div className="h-2 rounded-full bg-brand" style={{ width: `${(d.feitas / max) * 100}%`, minWidth: d.feitas ? 4 : 0 }} />
                            <div className="h-2 rounded-full bg-slate-300" style={{ width: `${(d.recebidas / max) * 100}%`, minWidth: d.recebidas ? 4 : 0 }} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {(dados.usuarios.length > 0 || dados.numeros.length > 0) && (
              <div className="grid sm:grid-cols-2 gap-3">
                {dados.usuarios.length > 0 && (
                  <Lista titulo="Feitas por colaborador" itens={dados.usuarios.map((u) => ({ nome: u.nome, valor: `${u.feitas} feitas · ${u.atendidas} atendidas · ${tempo(u.segundos)}` }))} />
                )}
                {dados.numeros.length > 0 && (
                  <Lista titulo="Por número" itens={dados.numeros.map((n) => ({ nome: n.nome, valor: `${n.feitas} feitas · ${n.recebidas} recebidas` }))} />
                )}
              </div>
            )}

            <p className="text-[11px] text-slate-400">
              Barra roxa = feitas, cinza = recebidas. "Atendidas" = a ligação teve conversa (mais de 0s).
              {dados.historicoDesde ? ` Histórico salvo desde ${dados.historicoDesde.split("-").reverse().join("/")}.` : ""} {carregando ? "Atualizando…" : ""}
            </p>
          </>
        )}
      </div>
    </Secao>
  );
}

function Card({ rotulo, valor, sub, cor = "text-slate-800" }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-[11px] text-slate-500">{rotulo}</p>
      <p className={`text-xl font-semibold tabular-nums ${cor}`}>{valor}</p>
      <p className="text-[11px] text-slate-400">{sub}</p>
    </div>
  );
}

function Lista({ titulo, itens }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-xs font-medium text-slate-600 mb-2">{titulo}</p>
      <ul className="flex flex-col gap-1.5">
        {itens.map((i, k) => (
          <li key={k} className="flex justify-between gap-3 text-sm">
            <span className="text-slate-700 truncate">{i.nome}</span>
            <span className="text-slate-500 tabular-nums whitespace-nowrap text-xs">{i.valor}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
