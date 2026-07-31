"use client";

import { useEffect, useState } from "react";
import Icone from "@/components/Icones";

const money = (n) => "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Pix Copia-e-Cola + QR Code de uma parcela específica (item 20). Gerado sem
// nenhuma integração bancária — só a chave Pix cadastrada em Configurações.
export default function PixModal({ parcela, onClose }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    fetch(`/api/parcelas/${parcela.id}/pix`)
      .then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(d))))
      .then(setDados)
      .catch((d) => setErro(d?.error || "Não foi possível gerar o Pix."));
  }, [parcela.id]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 text-center" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-800">Pix da {parcela.number}ª parcela</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        {erro && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">{erro}</p>
        )}

        {!erro && !dados && <p className="text-xs text-slate-400 py-6">Gerando…</p>}

        {dados && (
          <>
            <p className="text-2xl font-bold text-slate-800 mb-3">{money(dados.valor)}</p>
            <img src={dados.qrCodeDataUrl} alt="QR Code Pix" className="w-48 h-48 mx-auto rounded-lg border border-slate-100" />
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(dados.payload);
                  setCopiado(true);
                  setTimeout(() => setCopiado(false), 1500);
                } catch {}
              }}
              className="mt-3 w-full flex items-center justify-center gap-1.5 text-sm bg-emerald-500 text-white rounded-lg py-2 hover:bg-emerald-600"
            >
              <Icone nome={copiado ? "check" : "copiar"} className="w-4 h-4" />
              {copiado ? "Copiado!" : "Copiar código Pix"}
            </button>
            <p className="text-[10px] text-slate-400 mt-2">Envie o código ou o QR pro cliente — ele mesmo escolhe o jeito que preferir pagar.</p>
          </>
        )}
      </div>
    </div>
  );
}
