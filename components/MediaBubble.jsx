"use client";

import { useEffect, useState } from "react";

// Carrega a mídia (base64) de uma mensagem sob demanda — a listagem de mensagens
// não traz mais o arquivo inteiro, só o "kind"/fileName. Isso evita payloads de
// vários MB toda vez que o chat abre ou faz polling.
export default function MediaBubble({ message }) {
  const [url, setUrl] = useState(message.mediaUrl || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (url || message.mediaUrl) return;
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
      <a href={url} target="_blank" rel="noreferrer">
        <img src={url} alt={message.fileName || "imagem"} className="rounded-md max-w-[220px] max-h-[220px] object-cover" />
      </a>
    ) : (
      <p className="text-xs text-slate-400">{loading ? "Carregando imagem…" : "Imagem"}</p>
    );
  }

  if (message.kind === "document") {
    return url ? (
      <a href={url} target="_blank" rel="noreferrer" className="underline text-xs" download={message.fileName || undefined}>
        {message.fileName || "documento"}
      </a>
    ) : (
      <p className="text-xs text-slate-400">
        {loading ? "Carregando…" : (message.fileName || "documento")}
      </p>
    );
  }

  return null;
}
