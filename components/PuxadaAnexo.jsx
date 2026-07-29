"use client";

import { useRef, useState } from "react";
import { MediaLightbox } from "./MediaBubble";
import { RISCO_LABEL } from "@/lib/scoreCredito";
import Icone from "@/components/Icones";

const money = (n) =>
  "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const RISCO_ESTILO = {
  baixo: { fundo: "bg-emerald-50", borda: "border-emerald-200", texto: "text-emerald-700", barra: "bg-emerald-500" },
  medio: { fundo: "bg-amber-50", borda: "border-amber-200", texto: "text-amber-700", barra: "bg-amber-500" },
  alto: { fundo: "bg-red-50", borda: "border-red-200", texto: "text-red-700", barra: "bg-red-500" },
  bloqueio: { fundo: "bg-red-100", borda: "border-red-300", texto: "text-red-800", barra: "bg-red-700" },
};

// Resultado do score de crédito calculado a partir da puxada. É consultivo:
// mostra o porquê da nota pra apoiar a decisão, sem bloquear nada.
function ScoreCredito({ score, risco, limite, motivos, renda, emprestimos, ccf, processos }) {
  if (score == null || !risco) return null;
  const st = RISCO_ESTILO[risco] || RISCO_ESTILO.medio;
  const lista = (motivos || "").split("|").filter(Boolean);

  return (
    <div className={`mt-2 rounded-lg border p-2.5 ${st.fundo} ${st.borda}`}>
      <div className="flex items-center justify-between">
        <span className={`text-xs font-semibold ${st.texto}`}>{RISCO_LABEL[risco] || risco}</span>
        <span className={`text-xs font-semibold ${st.texto}`}>{score}/100</span>
      </div>
      <div className="w-full bg-white/70 rounded-full h-1.5 mt-1.5">
        <div className={`h-1.5 rounded-full ${st.barra}`} style={{ width: `${score}%` }} />
      </div>
      <p className={`text-[11px] mt-1.5 font-medium ${st.texto}`}>
        Limite sugerido: {limite > 0 ? money(limite) : "não liberar"}
      </p>
      {lista.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {lista.map((m, i) => (
            <li key={i} className="text-[10px] text-slate-500">• {m}</li>
          ))}
        </ul>
      )}
      <p className="text-[10px] text-slate-400 mt-1.5">
        {[
          renda != null && `Renda ${money(renda)}`,
          emprestimos != null && `${emprestimos} empréstimo(s) ativo(s)`,
          ccf ? `${ccf} CCF` : null,
          processos ? `${processos} processo(s)` : null,
        ].filter(Boolean).join(" · ")}
      </p>
    </div>
  );
}

// Anexo fixo de PDF (puxada/consulta de credito), compartilhado entre Kanban e Chat.
export default function PuxadaAnexo({
  contactId, cpf, puxadaUrl, puxadaFileName, onChange,
  puxadaScore, puxadaRisco, puxadaLimite, puxadaMotivos,
  puxadaRenda, puxadaEmprestimos, puxadaCcf, puxadaProcessos,
}) {
  const [enviando, setEnviando] = useState(false);
  const [consultando, setConsultando] = useState(false);
  const [erro, setErro] = useState("");
  const [aberta, setAberta] = useState(false);
  const inputRef = useRef(null);

  async function consultar() {
    const cpfLimpo = String(cpf || "").replace(/\D/g, "");
    if (cpfLimpo.length !== 11) {
      setErro("Informe o CPF da lead antes de puxar automaticamente.");
      return;
    }
    setErro("");
    setConsultando(true);
    const res = await fetch(`/api/contacts/${contactId}/puxada/auto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cpf: cpfLimpo }),
    });
    const data = await res.json().catch(() => ({}));
    setConsultando(false);
    if (!res.ok) { setErro(data.error || "Falha ao consultar a puxada."); return; }
    onChange(data);
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf") { setErro("So e permitido PDF."); return; }
    setErro("");
    setEnviando(true);
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const res = await fetch(`/api/contacts/${contactId}/puxada`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base64, fileName: file.name, mimetype: file.type }),
    });
    const data = await res.json().catch(() => ({}));
    setEnviando(false);
    if (!res.ok) { setErro(data.error || "Falha ao enviar."); return; }
    onChange(data);
  }

  async function remover() {
    if (!confirm("Remover a puxada anexada deste lead?")) return;
    await fetch(`/api/contacts/${contactId}/puxada`, { method: "DELETE" });
    onChange({ puxadaUrl: null, puxadaFileName: null });
  }

  return (
    <div className="border border-slate-200 rounded-lg p-2.5">
      <div className="flex items-center justify-between text-xs font-medium text-slate-600">
        <span className="flex items-center gap-1"><Icone nome="clipe" className="w-3.5 h-3.5" /> Puxada (consulta de crédito)</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={consultar}
            disabled={consultando || enviando}
            className="flex items-center gap-1 text-sky-600 hover:text-sky-700 font-normal disabled:opacity-50 disabled:cursor-wait"
          >
            {consultando ? "Consultando..." : (<><Icone nome="lupa" className="w-3.5 h-3.5" /> Puxada</>)}
          </button>
          {puxadaUrl && (
            <button type="button" onClick={remover} className="text-red-400 hover:text-red-600 font-normal">
              Remover
            </button>
          )}
        </div>
      </div>
      <p className="text-[10px] text-slate-400 mt-1">
        "Puxada" consulta pelo CPF e anexa o PDF automaticamente.
      </p>
      {puxadaUrl ? (
        <button
          type="button"
          onClick={() => setAberta(true)}
          className="mt-2 w-full flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 rounded-md px-2.5 py-2 hover:bg-emerald-100 transition-colors truncate text-left"
        >
          <Icone nome="documento" className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{puxadaFileName || "puxada.pdf"}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={enviando || consultando}
          className="mt-2 w-full text-xs text-slate-500 border border-dashed border-slate-300 rounded-md py-2 hover:border-emerald-400 hover:text-emerald-600 transition-colors disabled:opacity-50"
        >
          {enviando ? "Enviando..." : "+ Anexar PDF"}
        </button>
      )}
      <ScoreCredito
        score={puxadaScore}
        risco={puxadaRisco}
        limite={puxadaLimite}
        motivos={puxadaMotivos}
        renda={puxadaRenda}
        emprestimos={puxadaEmprestimos}
        ccf={puxadaCcf}
        processos={puxadaProcessos}
      />
      {erro && <p className="text-[11px] text-red-500 mt-1">{erro}</p>}
      <input ref={inputRef} type="file" accept="application/pdf" onChange={onFile} className="hidden" />
      {aberta && puxadaUrl && (
        <MediaLightbox
          url={puxadaUrl}
          mimetype="application/pdf"
          fileName={puxadaFileName}
          kind="document"
          onClose={() => setAberta(false)}
        />
      )}
    </div>
  );
}
