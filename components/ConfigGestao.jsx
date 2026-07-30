"use client";

import { useCallback, useEffect, useState } from "react";
import Icone from "@/components/Icones";

const money = (n) =>
  "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Cabecalho({ icone, titulo, subtitulo }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
        <Icone nome={icone} className="w-4.5 h-4.5" />
      </span>
      <div className="min-w-0">
        <h2 className="font-semibold text-slate-800">{titulo}</h2>
        {subtitulo && <p className="text-xs text-slate-400">{subtitulo}</p>}
      </div>
    </div>
  );
}

function Campo({ label, hint, ...props }) {
  return (
    <label className="block">
      <span className="text-xs text-slate-500">{label}</span>
      <input
        {...props}
        className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400"
      />
      {hint && <span className="block text-[10px] text-slate-400 mt-0.5">{hint}</span>}
    </label>
  );
}

/* ---------------- Comissão dos cobradores ---------------- */
export function ComissaoConfig() {
  const [f, setF] = useState({ metaDiariaValor: "", bonusDiario: "", metaSemanalValor: "", bonusSemanal: "" });
  const [salvando, setSalvando] = useState(false);
  const [saved, setSaved] = useState(false);
  const [equipe, setEquipe] = useState([]);

  useEffect(() => {
    fetch("/api/comissao").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (d?.config) {
        setF({
          metaDiariaValor: d.config.metaDiariaValor || "",
          bonusDiario: d.config.bonusDiario || "",
          metaSemanalValor: d.config.metaSemanalValor || "",
          bonusSemanal: d.config.bonusSemanal || "",
        });
      }
    }).catch(() => {});
    fetch("/api/users").then((r) => r.json()).then((us) => {
      const cobradores = (Array.isArray(us) ? us : []).filter((u) => u.role === "cobrador");
      Promise.all(
        cobradores.map((u) =>
          fetch(`/api/comissao?nome=${encodeURIComponent(u.name)}`)
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null)
        )
      ).then((rs) => setEquipe(rs.filter(Boolean)));
    }).catch(() => {});
  }, []);

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true);
    await fetch("/api/comissao", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(f),
    });
    setSalvando(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div className="space-y-6 max-w-2xl">
      <form onSubmit={salvar} className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5 space-y-4">
        <Cabecalho
          icone="dinheiro"
          titulo="Comissão dos cobradores"
          subtitulo="Bônus por bater a meta de valor recuperado. A semana de cobrança é de segunda a sábado."
        />

        <div className="grid sm:grid-cols-2 gap-3">
          <Campo
            label="Meta do dia (R$ recuperados)"
            type="number"
            step="0.01"
            value={f.metaDiariaValor}
            onChange={set("metaDiariaValor")}
            placeholder="0 = sem meta diária"
          />
          <Campo
            label="Bônus por dia batido (R$)"
            type="number"
            step="0.01"
            value={f.bonusDiario}
            onChange={set("bonusDiario")}
            hint="Ganha esse valor em cada dia que bater a meta."
          />
          <Campo
            label="Meta da semana (R$ recuperados)"
            type="number"
            step="0.01"
            value={f.metaSemanalValor}
            onChange={set("metaSemanalValor")}
            placeholder="0 = sem meta semanal"
          />
          <Campo
            label="Bônus da semana (R$)"
            type="number"
            step="0.01"
            value={f.bonusSemanal}
            onChange={set("bonusSemanal")}
            hint="Ganha uma vez, se o total de segunda a sábado bater a meta."
          />
        </div>

        <p className="text-[11px] text-slate-500 bg-slate-50 rounded-lg p-2.5">
          O cobrador vê o quanto já acumulou na tela <strong>Cobrança</strong>, junto com quais dias bateu — e o
          acerto é no fim de semana. Só conta o que ele mesmo deu baixa.
        </p>

        <button
          disabled={salvando}
          className="w-full bg-emerald-500 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-emerald-600 disabled:opacity-50"
        >
          {salvando ? "Salvando…" : saved ? "Salvo" : "Salvar"}
        </button>
      </form>

      {equipe.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800">Semana atual por cobrador</h3>
            <p className="text-[11px] text-slate-400">
              {equipe[0]?.semanaInicio?.split("-").reverse().join("/")} a{" "}
              {equipe[0]?.semanaFim?.split("-").reverse().join("/")}
            </p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-400 border-b border-slate-100">
                <th className="text-left font-medium px-4 py-2">Cobrador</th>
                <th className="text-right font-medium px-3 py-2">Recuperado</th>
                <th className="text-right font-medium px-3 py-2">Dias batidos</th>
                <th className="text-right font-medium px-4 py-2">A receber</th>
              </tr>
            </thead>
            <tbody>
              {equipe.map((r) => (
                <tr key={r.nome} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-2.5 text-slate-700 truncate">{r.nome}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600">{money(r.totalSemana)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-500">{r.diasBatidos}/6</td>
                  <td className="px-4 py-2.5 text-right font-medium text-emerald-600">{money(r.totalAReceber)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------------- Risco: escalonamento de capital, CPF, atraso, provisão ---------------- */
export function RiscoConfig() {
  const [c, setC] = useState(null);
  const [users, setUsers] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/config").then((r) => r.json()).then(setC).catch(() => {});
    fetch("/api/users").then((r) => r.json()).then((u) => setUsers(Array.isArray(u) ? u : [])).catch(() => {});
  }, []);

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true);
    const res = await fetch("/api/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        escalonamentoAtivo: !!c.escalonamentoAtivo,
        escalonamentoBase: c.escalonamentoBase,
        escalonamentoIncremento: c.escalonamentoIncremento,
        escalonamentoTeto: c.escalonamentoTeto === "" ? null : c.escalonamentoTeto,
        bloqueioCpfAtivo: !!c.bloqueioCpfAtivo,
        escalonamentoAtrasoDias: c.escalonamentoAtrasoDias === "" ? null : c.escalonamentoAtrasoDias,
        escalonamentoAtrasoResponsavel: c.escalonamentoAtrasoResponsavel || null,
        capitalOciosoDias: c.capitalOciosoDias,
        provisaoPct0a7: c.provisaoPct0a7,
        provisaoPct8a15: c.provisaoPct8a15,
        provisaoPct16a30: c.provisaoPct16a30,
        provisaoPct31mais: c.provisaoPct31mais,
      }),
    });
    setC(await res.json());
    setSalvando(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  if (!c) return <p className="text-sm text-slate-400">Carregando…</p>;

  const set = (k) => (e) => setC((p) => ({ ...p, [k]: e.target.value }));
  const toggle = (k) => () => setC((p) => ({ ...p, [k]: !p[k] }));

  // Prévia dos primeiros ciclos, pra ficar concreto o que o escalonamento faz.
  const previa = [1, 2, 3, 4].map((ciclo) => {
    let v = Number(c.escalonamentoBase || 0) + Number(c.escalonamentoIncremento || 0) * (ciclo - 1);
    if (c.escalonamentoTeto) v = Math.min(v, Number(c.escalonamentoTeto));
    return { ciclo, v };
  });

  return (
    <form onSubmit={salvar} className="space-y-6 max-w-2xl">
      {/* Capital escalonado */}
      <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <Cabecalho
            icone="escudo"
            titulo="Capital escalonado por ciclo"
            subtitulo="O 1º empréstimo trava num valor baixo e só sobe a cada ciclo quitado."
          />
          <button
            type="button"
            onClick={toggle("escalonamentoAtivo")}
            className={`relative shrink-0 w-9 h-5 rounded-full transition-colors ${c.escalonamentoAtivo ? "bg-emerald-500" : "bg-slate-200"}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${c.escalonamentoAtivo ? "translate-x-4" : ""}`} />
          </button>
        </div>

        {c.escalonamentoAtivo && (
          <>
            <div className="grid sm:grid-cols-3 gap-3">
              <Campo label="1º empréstimo (R$)" type="number" step="0.01" value={c.escalonamentoBase ?? ""} onChange={set("escalonamentoBase")} />
              <Campo label="Aumento por ciclo (R$)" type="number" step="0.01" value={c.escalonamentoIncremento ?? ""} onChange={set("escalonamentoIncremento")} />
              <Campo label="Teto máximo (R$)" type="number" step="0.01" value={c.escalonamentoTeto ?? ""} onChange={set("escalonamentoTeto")} placeholder="sem teto" />
            </div>
            <div className="flex flex-wrap gap-2">
              {previa.map((p) => (
                <span key={p.ciclo} className="text-[11px] rounded-full px-2.5 py-1 bg-slate-100 text-slate-600">
                  ciclo {p.ciclo}: {money(p.v)}
                </span>
              ))}
            </div>
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
              Acima do limite, só administrador consegue liberar. Vendedor e cobrador são bloqueados.
            </p>
          </>
        )}
      </div>

      {/* CPF reincidente */}
      <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <Cabecalho
            icone="proibido"
            titulo="Bloquear CPF que já deu calote"
            subtitulo="Impede avançar no funil um CPF que já virou Cravo em outro cadastro."
          />
          <button
            type="button"
            onClick={toggle("bloqueioCpfAtivo")}
            className={`relative shrink-0 w-9 h-5 rounded-full transition-colors ${c.bloqueioCpfAtivo ? "bg-emerald-500" : "bg-slate-200"}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${c.bloqueioCpfAtivo ? "translate-x-4" : ""}`} />
          </button>
        </div>
        <p className="text-[11px] text-slate-500">
          Pega o caso de quem volta com telefone novo. Administrador ainda consegue forçar, se quiser dar outra chance.
        </p>
      </div>

      {/* Escalonamento por atraso */}
      <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5 space-y-4">
        <Cabecalho
          icone="relogio"
          titulo="Passar cobrança velha pro cobrador sênior"
          subtitulo="Cobrança que ninguém destrava precisa trocar de mão em vez de envelhecer na mesma fila."
        />
        <div className="grid sm:grid-cols-2 gap-3">
          <Campo
            label="A partir de quantos dias de atraso"
            type="number"
            min="1"
            value={c.escalonamentoAtrasoDias ?? ""}
            onChange={set("escalonamentoAtrasoDias")}
            placeholder="vazio = desligado"
          />
          <label className="block">
            <span className="text-xs text-slate-500">Passar para</span>
            <select
              value={c.escalonamentoAtrasoResponsavel || ""}
              onChange={set("escalonamentoAtrasoResponsavel")}
              className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white outline-none focus:border-emerald-400"
            >
              <option value="">— Ninguém (desligado) —</option>
              {users.map((u) => (<option key={u.id} value={u.name}>{u.name}</option>))}
            </select>
          </label>
        </div>
      </div>

      {/* Capital ocioso */}
      <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5 space-y-4">
        <Cabecalho
          icone="ampulheta"
          titulo="Alerta de capital ocioso"
          subtitulo="Dinheiro parado em caixa sem liberar empréstimo é lucro que não aconteceu."
        />
        <Campo
          label="Avisar após quantos dias sem liberar capital"
          type="number"
          min="1"
          value={c.capitalOciosoDias ?? ""}
          onChange={set("capitalOciosoDias")}
          hint="Usa o mesmo número de WhatsApp configurado em Alertas."
        />
      </div>

      {/* Provisão */}
      <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5 space-y-4">
        <Cabecalho
          icone="grafico"
          titulo="Provisão de perda por faixa de atraso"
          subtitulo="Quanto de cada faixa você espera NÃO receber. Alimenta a projeção de perda em Relatórios."
        />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Campo label="1 a 7 dias (%)" type="number" min="0" max="100" value={c.provisaoPct0a7 ?? ""} onChange={set("provisaoPct0a7")} />
          <Campo label="8 a 15 dias (%)" type="number" min="0" max="100" value={c.provisaoPct8a15 ?? ""} onChange={set("provisaoPct8a15")} />
          <Campo label="16 a 30 dias (%)" type="number" min="0" max="100" value={c.provisaoPct16a30 ?? ""} onChange={set("provisaoPct16a30")} />
          <Campo label="+30 dias (%)" type="number" min="0" max="100" value={c.provisaoPct31mais ?? ""} onChange={set("provisaoPct31mais")} />
        </div>
        <p className="text-[11px] text-slate-500">
          É uma referência pra decidir quanto emprestar — não gera lançamento no financeiro.
        </p>
      </div>

      <button
        disabled={salvando}
        className="w-full bg-emerald-500 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-emerald-600 disabled:opacity-50"
      >
        {salvando ? "Salvando…" : saved ? "Salvo" : "Salvar"}
      </button>
    </form>
  );
}

/* ---------------- Log de auditoria ---------------- */
const ACAO_LABEL = {
  mover_etapa: "Mudou etapa",
  excluir_contato: "Excluiu lead",
  dar_baixa: "Deu baixa",
  estornar_baixa: "Desfez baixa",
  acordo_parcelado: "Criou acordo",
  escalonamento_atraso: "Escalonou por atraso",
  alterar_permissao: "Alterou permissão",
  trocar_senha: "Trocou senha",
  excluir_usuario: "Excluiu usuário",
  excluir_lancamento: "Excluiu lançamento",
};

const ACAO_COR = {
  excluir_contato: "bg-red-50 text-red-600",
  excluir_usuario: "bg-red-50 text-red-600",
  excluir_lancamento: "bg-red-50 text-red-600",
  estornar_baixa: "bg-amber-50 text-amber-600",
  alterar_permissao: "bg-violet-50 text-violet-600",
  trocar_senha: "bg-violet-50 text-violet-600",
  dar_baixa: "bg-emerald-50 text-emerald-600",
  acordo_parcelado: "bg-sky-50 text-sky-600",
};

export function AuditoriaLog() {
  const [logs, setLogs] = useState([]);
  const [acao, setAcao] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const qs = acao ? `?acao=${encodeURIComponent(acao)}` : "";
    const d = await fetch(`/api/auditoria${qs}`).then((r) => (r.ok ? r.json() : [])).catch(() => []);
    setLogs(Array.isArray(d) ? d : []);
    setLoading(false);
  }, [acao]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5 border-b border-slate-100">
        <Cabecalho
          icone="escudo"
          titulo="Log de auditoria"
          subtitulo="Quem fez o quê, e quando. Cobre as ações que mexem em dinheiro, lead e permissão."
        />
        <select
          value={acao}
          onChange={(e) => setAcao(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white outline-none focus:border-emerald-400"
        >
          <option value="">Todas as ações</option>
          {Object.entries(ACAO_LABEL).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400 p-6 text-center">Carregando…</p>
      ) : logs.length === 0 ? (
        <p className="text-sm text-slate-400 p-6 text-center">Nenhum registro ainda.</p>
      ) : (
        <ul className="divide-y divide-slate-50">
          {logs.map((l) => (
            <li key={l.id} className="px-5 py-3 flex items-start gap-3">
              <span className={`text-[10px] rounded-full px-2 py-0.5 shrink-0 ${ACAO_COR[l.acao] || "bg-slate-100 text-slate-500"}`}>
                {ACAO_LABEL[l.acao] || l.acao}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-700 break-words">{l.detalhe || "—"}</p>
                <p className="text-[11px] text-slate-400">
                  {l.usuario || "sistema"} · {new Date(l.createdAt).toLocaleString("pt-BR")}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
