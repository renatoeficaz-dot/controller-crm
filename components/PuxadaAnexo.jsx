"use client";

import { useRef, useState } from "react";
import { MediaLightbox } from "./MediaBubble";

// Anexo fixo de PDF (puxada/consulta de crédito) — sempre visível no card do
// lead, independente do histórico de mensagens. Upload dispara na hora
// (não depende do botão "Salvar" do resto do form). Compartilhado entre o
// modal do Kanban e o painel do Chat pra não duplicar (e desalinhar) a lógica.
export default function PuxadaAnexo({ contactId, phone, puxadaUrl, puxadaFileName, onChange }) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [aberta, setAberta] = useState(false);
  const inputRef = useRef(null);

  // Abre o site de consulta (detetiveforense.com) numa aba nova e copia o
  // telefone do lead pra área de transferência, pra só colar no campo de busca
  // de lá — login/busca/exportação continuam manuais (o site não tem API e
  // login automatizado por senha não é algo que a gente automatiza aqui).
  async function consultar() {
    if (phone) {
      try {
        await navigator.clipboard.writeText(phone.replace(/\D/g, ""));
      } catch {}
    }
    window.open("https://detetiveforense.com", "_blank", "noopener,noreferrer");
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf") { setErro("Só é permitido PDF."); return; }
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
        <span>📎 Puxada (consulta de crédito)</span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={consultar} className="text-sky-600 hover:text-sky-700 font-normal">
            🔍 Puxada
          </button>
          {puxadaUrl && (
            <button type="button" onClick={remover} className="text-red-400 hover:text-red-600 font-normal">
              Remover
            </button>
          )}
        </div>
      </div>
      {phone && (
        <p className="text-[10px] text-slate-400 mt-1">
          "Puxada" abre o site e copia o telefone — é só colar lá.
        </p>
      )}
      {puxadaUrl ? (
        <button
          type="button"
          onClick={() => setAberta(true)}
          className="mt-2 w-full flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 rounded-md px-2.5 py-2 hover:bg-emerald-100 transition-colors truncate text-left"
        >
          <span>📄</span>
          <span className="truncate">{puxadaFileName || "puxada.pdf"}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={enviando}
          className="mt-2 w-full text-xs text-slate-500 border border-dashed border-slate-300 rounded-md py-2 hover:border-emerald-400 hover:text-emerald-600 transition-colors disabled:opacity-50"
        >
          {enviando ? "Enviando…" : "+ Anexar PDF"}
        </button>
      )}
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
