"use client";

import { useEffect, useState } from "react";

// Popup pra ver a mídia direto no sistema, sem abrir aba nova nem forçar download.
function MediaLightbox({ url, mimetype, fileName, kind, onClose }) {
  const isPreviewable = kind === "image" || mimetype === "application/pdf";
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="max-w-3xl max-h-[85vh] w-full flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
        <div className="w-full flex justify-end mb-2">
          <button onClick={onClose} className="text-white/80 hover:text-white text-2xl leading-none">×</button>
        </div>
        {kind === "image" && (
          <img src={url} alt={fileName || "imagem"} className="max-w-full max-h-[75vh] rounded-lg object-contain" />
        )}
        {kind !== "image" && mimetype === "application/pdf" && (
          <iframe src={url} title={fileName || "documento"} className="w-full h-[75vh] rounded-lg bg-white" />
        )}
        {kind !== "image" && !isPreviewable && (
          <div className="bg-white rounded-lg p-6 text-center text-sm text-slate-600">
            <p className="mb-3">Esse tipo de arquivo não tem visualização direta ({fileName || "documento"}).</p>
            <a href={url} target="_blank" rel="noreferrer" className="text-emerald-600 underline">
              Abrir em nova aba
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// Carrega a mídia (base64) de uma mensagem sob demanda — a listagem de mensagens
// não traz mais o arquivo inteiro, só o "kind"/fileName. Isso evita payloads de
// vários MB toda vez que o chat abre ou faz polling.
export default function MediaBubble({ message }) {
  const [url, setUrl] = useState(message.mediaUrl || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (url || message.mediaUrl || message.kind === "location") return; // localização não tem arquivo pra carregar
    let cancelled = false;
    setLoading(true);
    fetch(`/api/messages/${message.id}/media`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d?.mediaUrl) setUrl(d.mediaUrl);
        else setError(true);
      })
      .catch(() => !cancelled && setError(true))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [message.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <p className="text-xs text-red-400">Não foi possível carregar o arquivo.</p>;

  if (message.kind === "audio") {
    return url ? (
      <audio controls src={url} className="max-w-[220px] h-9" />
    ) : (
      <p className="text-xs text-slate-400">{loading ? "Carregando áudio…" : "Áudio"}</p>
    );
  }

  if (message.kind === "image") {
    return url ? (
      <>
        <button type="button" onClick={() => setOpen(true)} className="block">
          <img src={url} alt={message.fileName || "imagem"} className="rounded-md max-w-[220px] max-h-[220px] object-cover" />
        </button>
        {open && (
          <MediaLightbox url={url} mimetype={message.mimeType} fileName={message.fileName} kind="image" onClose={() => setOpen(false)} />
        )}
      </>
    ) : (
      <p className="text-xs text-slate-400">{loading ? "Carregando imagem…" : "Imagem"}</p>
    );
  }

  if (message.kind === "location") {
    // Localização não passa pelo carregamento sob demanda — o link já vem no corpo da mensagem
    const match = /(https:\/\/www\.google\.com\/maps\?q=[^\s]+)/.exec(message.body || "");
    const mapsUrl = match?.[1];
    const label = (message.body || "").replace(mapsUrl || "", "").trim();
    if (!mapsUrl) return <p>{message.body}</p>;
    return (
      <a
        href={mapsUrl}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1.5 underline text-sm"
      >
        📍 {label || "Ver localização no mapa"}
      </a>
    );
  }

  if (message.kind === "document") {
    return url ? (
      <>
        <button type="button" onClick={() => setOpen(true)} className="underline text-xs text-left">
          {message.fileName || "documento"}
        </button>
        {open && (
          <MediaLightbox url={url} mimetype={message.mimeType} fileName={message.fileName} kind="document" onClose={() => setOpen(false)} />
        )}
      </>
    ) : (
      <p className="text-xs text-slate-400">
        {loading ? "Carregando…" : (message.fileName || "documento")}
      </p>
    );
  }

  return null;
}
