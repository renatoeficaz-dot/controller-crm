"use client";

import { useEffect, useState } from "react";
import Icone from "@/components/Icones";
import MediaBubble, { MediaLightbox } from "./MediaBubble";

const TIPOS = [
  { chave: "rg", label: "RG" },
  { chave: "cnh", label: "CNH" },
  { chave: "comprovante_renda", label: "Comprovante de renda" },
  { chave: "comprovante_endereco", label: "Comprovante de endereço" },
  { chave: "selfie", label: "Selfie" },
  { chave: "contrato", label: "Contrato" },
  { chave: "outro", label: "Outro" },
];
const labelTipo = (t) => TIPOS.find((x) => x.chave === t)?.label || t;

const MIDIA_KINDS = ["image", "document"];

// Popup de mídias/documentos do lead (itens 68/69): documentos organizados
// por TIPO numa aba, e a mídia crua do chat (ainda não classificada) noutra —
// clicar em "marcar tipo" promove a mídia do chat pra um Documento de verdade.
export default function DocumentosPopup({ contactId, messages, onClose }) {
  const [documentos, setDocumentos] = useState([]);
  const [aba, setAba] = useState("documentos");
  const [promovendo, setPromovendo] = useState(null); // messageId em promoção
  const [lightbox, setLightbox] = useState(null);

  const load = () => fetch(`/api/contacts/${contactId}/documentos`).then((r) => r.json()).then(setDocumentos).catch(() => {});
  useEffect(() => { load(); }, [contactId]);

  const midiasChat = (messages || []).filter((m) => MIDIA_KINDS.includes(m.kind));
  const porTipo = TIPOS.map((t) => ({ ...t, itens: documentos.filter((d) => d.tipo === t.chave) })).filter((t) => t.itens.length);

  async function conferir(doc) {
    const res = await fetch(`/api/documentos/${doc.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conferido: !doc.conferido }),
    });
    const atualizado = await res.json();
    setDocumentos((prev) => prev.map((d) => (d.id === doc.id ? atualizado : d)));
  }

  async function promover(messageId, tipo) {
    await fetch("/api/documentos/promover", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId, tipo }),
    });
    setPromovendo(null);
    load();
  }

  async function removerDoc(doc) {
    if (!confirm("Remover este documento?")) return;
    await fetch(`/api/documentos/${doc.id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto thin-scroll" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
          <h3 className="font-semibold text-slate-800">Documentos e mídias</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5 mx-5 mt-3 w-fit">
          <button onClick={() => setAba("documentos")} className={`text-xs px-3 py-1.5 rounded-md ${aba === "documentos" ? "bg-white shadow-sm font-medium text-slate-700" : "text-slate-500"}`}>
            Documentos ({documentos.length})
          </button>
          <button onClick={() => setAba("chat")} className={`text-xs px-3 py-1.5 rounded-md ${aba === "chat" ? "bg-white shadow-sm font-medium text-slate-700" : "text-slate-500"}`}>
            Mídias do chat ({midiasChat.length})
          </button>
        </div>

        <div className="p-5">
          {aba === "documentos" && (
            porTipo.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">
                Nenhum documento organizado ainda — vá na aba "Mídias do chat" e marque o tipo de cada uma.
              </p>
            ) : (
              <div className="space-y-4">
                {porTipo.map((t) => (
                  <div key={t.chave}>
                    <p className="text-xs font-semibold text-slate-600 mb-1.5">{t.label} ({t.itens.length})</p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {t.itens.map((d) => (
                        <div key={d.id} className="relative aspect-square rounded-md overflow-hidden bg-slate-50 border border-slate-100">
                          <button type="button" onClick={() => setLightbox(d)} className="w-full h-full">
                            {d.mimeType?.startsWith("image/") ? (
                              <img src={d.url} alt={t.label} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-slate-400">
                                <Icone nome="documento" className="w-6 h-6" />
                              </div>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => conferir(d)}
                            title={d.conferido ? `Conferido por ${d.conferidoPor || "?"}` : "Marcar como conferido"}
                            className={`absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center ${d.conferido ? "bg-emerald-500 text-white" : "bg-white/90 text-slate-400 border border-slate-200"}`}
                          >
                            <Icone nome="check" className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removerDoc(d)}
                            title="Remover"
                            className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-white/90 text-slate-400 hover:text-red-500 border border-slate-200 flex items-center justify-center"
                          >
                            <Icone nome="x" className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {aba === "chat" && (
            midiasChat.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">Nenhuma mídia trocada nessa conversa ainda.</p>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {midiasChat.map((m) => (
                  <div key={m.id} className="relative">
                    <div className="aspect-square rounded-md overflow-hidden bg-slate-50 border border-slate-100 flex items-center justify-center">
                      <MediaBubble message={m} />
                    </div>
                    {promovendo === m.id ? (
                      <select
                        autoFocus
                        onChange={(e) => e.target.value && promover(m.id, e.target.value)}
                        onBlur={() => setPromovendo(null)}
                        className="absolute inset-x-0.5 bottom-0.5 text-[9px] border border-emerald-300 rounded bg-white px-0.5"
                      >
                        <option value="">Marcar tipo…</option>
                        {TIPOS.map((t) => (<option key={t.chave} value={t.chave}>{t.label}</option>))}
                      </select>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPromovendo(m.id)}
                        className="absolute inset-x-0.5 bottom-0.5 text-[9px] bg-white/90 border border-slate-200 rounded text-slate-500 hover:text-emerald-600 py-0.5"
                      >
                        Marcar tipo
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>
      {lightbox && <MediaLightbox url={lightbox.url} onClose={() => setLightbox(null)} />}
    </div>
  );
}
