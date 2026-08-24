"use client";

import { useState } from "react";
import Icone from "@/components/Icones";

const RELACAO_LABEL = {
  familiar: "Familiar",
  vizinho: "Vizinho(a)",
  amigo: "Amigo(a)",
  trabalho: "Trabalho",
  outro: "Outro",
};

const linkWhatsapp = (telefone) => `https://wa.me/${(telefone || "").replace(/\D/g, "")}`;

// Item 73: contatos de referência do lead (família, vizinho, amigo...) — quem
// o cobrador aciona quando o próprio cliente some. Não são leads no sistema:
// o botão de WhatsApp só abre uma conversa externa (wa.me), não gera Contact
// nem passa pela IA. Cadastro/edição/remoção é só admin (dado sensível de
// terceiro) — quem não é admin só vê e copia.
export default function ReferenciasContato({ contactId, referencias, isAdmin, onChange }) {
  const [novo, setNovo] = useState(null); // { nome, telefone, relacao, dataNascimento } | null
  const [editando, setEditando] = useState(null); // id | null
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function adicionar() {
    if (!novo?.nome?.trim() || !novo?.telefone?.trim()) { setErro("Preencha nome e telefone."); return; }
    setSalvando(true);
    setErro("");
    const res = await fetch(`/api/contacts/${contactId}/referencias`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(novo),
    });
    const d = await res.json().catch(() => ({}));
    setSalvando(false);
    if (!res.ok) { setErro(d.error || "Erro ao salvar."); return; }
    onChange([...(referencias || []), d]);
    setNovo(null);
  }

  async function remover(id) {
    if (!confirm("Remover este contato de referência?")) return;
    await fetch(`/api/referencias/${id}`, { method: "DELETE" });
    onChange((referencias || []).filter((r) => r.id !== id));
  }

  async function salvarEdicao(id, patch) {
    setSalvando(true);
    const res = await fetch(`/api/referencias/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const d = await res.json().catch(() => ({}));
    setSalvando(false);
    if (!res.ok) { setErro(d.error || "Erro ao salvar."); return; }
    onChange((referencias || []).map((r) => (r.id === id ? d : r)));
    setEditando(null);
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
          <Icone nome="pessoas" className="w-4 h-4" /> Contatos de referência
        </h3>
        {isAdmin && !novo && (
          <button onClick={() => setNovo({ nome: "", telefone: "", relacao: "familiar", dataNascimento: "" })} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">
            + Adicionar
          </button>
        )}
      </div>
      <p className="text-[11px] text-slate-400 -mt-2">
        Família, vizinho, amigo... quem acionar quando o cliente some.{!isAdmin && " Só admin pode cadastrar ou editar."}
      </p>

      {(referencias || []).length === 0 && !novo && (
        <p className="text-xs text-slate-400">Nenhum contato de referência cadastrado.</p>
      )}

      <ul className="space-y-2">
        {(referencias || []).map((r) =>
          editando === r.id ? (
            <ReferenciaEditForm
              key={r.id}
              referencia={r}
              salvando={salvando}
              onCancel={() => setEditando(null)}
              onSalvar={(patch) => salvarEdicao(r.id, patch)}
            />
          ) : (
            <li key={r.id} className="flex items-center gap-2 border border-slate-100 rounded-lg px-2.5 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-700 truncate">{r.nome}</p>
                <p className="text-[11px] text-slate-400">
                  {r.telefone}
                  {r.relacao && <> · {RELACAO_LABEL[r.relacao] || r.relacao}</>}
                  {r.dataNascimento && <> · Nasc. {r.dataNascimento}</>}
                </p>
              </div>
              <a
                href={linkWhatsapp(r.telefone)}
                target="_blank"
                rel="noopener noreferrer"
                title="Conversar no WhatsApp"
                className="shrink-0 text-emerald-500 hover:text-emerald-600"
              >
                <Icone nome="chat" className="w-4 h-4" />
              </a>
              {isAdmin && (
                <>
                  <button onClick={() => setEditando(r.id)} title="Editar" className="shrink-0 text-slate-400 hover:text-slate-600">
                    <Icone nome="lapis" className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => remover(r.id)} title="Remover" className="shrink-0 text-red-400 hover:text-red-600">
                    <Icone nome="x" className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </li>
          )
        )}
      </ul>

      {novo && (
        <div className="border border-slate-200 rounded-lg p-2.5 space-y-2">
          <input
            autoFocus
            value={novo.nome}
            onChange={(e) => setNovo((f) => ({ ...f, nome: e.target.value }))}
            placeholder="Nome"
            className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-emerald-400"
          />
          <input
            value={novo.telefone}
            onChange={(e) => setNovo((f) => ({ ...f, telefone: e.target.value }))}
            placeholder="Telefone (DDD + número)"
            className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-emerald-400"
          />
          <input
            value={novo.dataNascimento}
            onChange={(e) => setNovo((f) => ({ ...f, dataNascimento: e.target.value }))}
            placeholder="Data de nascimento (opcional)"
            className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-emerald-400"
          />
          <select
            value={novo.relacao}
            onChange={(e) => setNovo((f) => ({ ...f, relacao: e.target.value }))}
            className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white outline-none focus:border-emerald-400"
          >
            {Object.entries(RELACAO_LABEL).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
          </select>
          {erro && <p className="text-xs text-red-500">{erro}</p>}
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setNovo(null); setErro(""); }} className="text-xs text-slate-500 px-2 py-1">Cancelar</button>
            <button disabled={salvando} onClick={adicionar} className="text-xs bg-emerald-500 text-white rounded-lg px-2.5 py-1 disabled:opacity-50">
              {salvando ? "Salvando…" : "Adicionar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ReferenciaEditForm({ referencia, salvando, onCancel, onSalvar }) {
  const [nome, setNome] = useState(referencia.nome);
  const [telefone, setTelefone] = useState(referencia.telefone);
  const [relacao, setRelacao] = useState(referencia.relacao || "outro");
  const [dataNascimento, setDataNascimento] = useState(referencia.dataNascimento || "");

  return (
    <li className="border border-slate-200 rounded-lg p-2.5 space-y-2">
      <input
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        placeholder="Nome"
        className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-emerald-400"
      />
      <input
        value={telefone}
        onChange={(e) => setTelefone(e.target.value)}
        placeholder="Telefone"
        className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-emerald-400"
      />
      <input
        value={dataNascimento}
        onChange={(e) => setDataNascimento(e.target.value)}
        placeholder="Data de nascimento (opcional)"
        className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-emerald-400"
      />
      <select
        value={relacao}
        onChange={(e) => setRelacao(e.target.value)}
        className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white outline-none focus:border-emerald-400"
      >
        {Object.entries(RELACAO_LABEL).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
      </select>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="text-xs text-slate-500 px-2 py-1">Cancelar</button>
        <button disabled={salvando} onClick={() => onSalvar({ nome, telefone, relacao, dataNascimento })} className="text-xs bg-emerald-500 text-white rounded-lg px-2.5 py-1 disabled:opacity-50">
          Salvar
        </button>
      </div>
    </li>
  );
}
