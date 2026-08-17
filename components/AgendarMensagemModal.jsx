"use client";

import { useRef, useState } from "react";
import Icone from "@/components/Icones";

function blobParaBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Agendamento de mensagem (item 45) — escolhe um modelo pronto, ou combina
// texto livre com um áudio gravado na hora ou uma imagem escolhida do
// computador. Quando texto e mídia são usados juntos, viram duas mensagens
// separadas na ordem escolhida (mídia antes ou depois do texto).
export default function AgendarMensagemModal({ contactId, textoInicial, templates, numbers, numeroInicial, onClose, onAgendado }) {
  const [templateId, setTemplateId] = useState("");
  const [corpo, setCorpo] = useState(textoInicial || "");
  const [numeroId, setNumeroId] = useState(numeroInicial || "");
  const [dataHora, setDataHora] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const [recording, setRecording] = useState(false);
  const [audioGravado, setAudioGravado] = useState(null); // { url, blob } | null
  const [imagemEscolhida, setImagemEscolhida] = useState(null); // { url, file } | null
  const [ordemMidia, setOrdemMidia] = useState("depois"); // "antes" | "depois" do texto
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const imagemInputRef = useRef(null);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (ev) => ev.data.size && chunksRef.current.push(ev.data);
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioGravado({ url: URL.createObjectURL(blob), blob });
        setTemplateId("");
        streamRef.current?.getTracks().forEach((t) => t.stop());
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
    } catch {
      setErro("Não foi possível acessar o microfone.");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setRecording(false);
  }

  async function salvar(e) {
    e.preventDefault();
    setErro("");
    if (!numeroId || !dataHora) { setErro("Escolha o número e a data/hora."); return; }
    if (!templateId && !corpo.trim() && !audioGravado && !imagemEscolhida) {
      setErro("Escreva um texto, grave um áudio ou escolha uma imagem.");
      return;
    }
    setSalvando(true);

    const body = { contactId, numeroId, dataHora };
    if (templateId) {
      body.templateId = templateId;
    } else {
      if (corpo.trim()) body.corpo = corpo.trim();
      if (audioGravado) {
        body.midiaBase64 = await blobParaBase64(audioGravado.blob);
        body.midiaMimetype = "audio/webm";
        body.midiaFileName = `audio-${Date.now()}.webm`;
        body.midiaTipo = "audio";
      } else if (imagemEscolhida) {
        body.midiaBase64 = await blobParaBase64(imagemEscolhida.file);
        body.midiaMimetype = imagemEscolhida.file.type || "image/jpeg";
        body.midiaFileName = imagemEscolhida.file.name;
        body.midiaTipo = "image";
      }
      // Ordem só importa quando existe mídia PRÓPRIA junto com texto — as duas
      // viram mensagens separadas, uma antes da outra.
      if (body.midiaTipo && body.corpo) body.ordemMidia = ordemMidia;
    }

    const res = await fetch("/api/mensagens-agendadas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json().catch(() => ({}));
    setSalvando(false);
    if (!res.ok) { setErro(d.error || "Erro ao agendar."); return; }
    onAgendado?.();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/40 flex items-center justify-center p-4" onClick={onClose}>
      <form onSubmit={salvar} className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-800">Agendar mensagem</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
        <label className="block">
          <span className="text-xs text-slate-400">Mensagem pronta (opcional)</span>
          <select
            value={templateId}
            onChange={(e) => { setTemplateId(e.target.value); if (e.target.value) { setAudioGravado(null); setImagemEscolhida(null); } }}
            className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white outline-none focus:border-emerald-400"
          >
            <option value="">— Texto livre, áudio ou imagem —</option>
            {templates.map((t) => (<option key={t.id} value={t.id}>{t.title}</option>))}
          </select>
        </label>
        {!templateId && (
          <label className="block">
            <span className="text-xs text-slate-400">Texto {(audioGravado || imagemEscolhida) && "(opcional, além da mídia)"}</span>
            <textarea rows={3} value={corpo} onChange={(e) => setCorpo(e.target.value)} className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400 resize-none" />
          </label>
        )}
        {!templateId && !imagemEscolhida && (
          <div>
            {audioGravado ? (
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2">
                <audio src={audioGravado.url} controls className="h-8 flex-1" />
                <button type="button" onClick={() => setAudioGravado(null)} className="text-xs text-red-500 hover:text-red-600 shrink-0">Remover</button>
              </div>
            ) : (
              <button
                type="button"
                onClick={recording ? stopRecording : startRecording}
                className={`w-full flex items-center justify-center gap-1.5 text-xs rounded-lg px-2.5 py-2 border ${
                  recording ? "border-red-300 bg-red-50 text-red-600 animate-pulse" : "border-slate-200 text-slate-500 hover:bg-slate-50"
                }`}
              >
                <Icone nome={recording ? "parar" : "microfone"} className="w-3.5 h-3.5" />
                {recording ? "Gravando… clique pra parar" : "Gravar áudio pra agendar"}
              </button>
            )}
          </div>
        )}
        {!templateId && !audioGravado && (
          <div>
            {imagemEscolhida ? (
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imagemEscolhida.url} alt="" className="h-10 w-10 object-cover rounded" />
                <span className="text-xs text-slate-500 flex-1 truncate">{imagemEscolhida.file.name}</span>
                <button type="button" onClick={() => setImagemEscolhida(null)} className="text-xs text-red-500 hover:text-red-600 shrink-0">Remover</button>
              </div>
            ) : (
              <>
                <input
                  ref={imagemInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setImagemEscolhida({ url: URL.createObjectURL(file), file });
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => imagemInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-1.5 text-xs rounded-lg px-2.5 py-2 border border-slate-200 text-slate-500 hover:bg-slate-50"
                >
                  <Icone nome="imagem" className="w-3.5 h-3.5" />
                  Escolher imagem pra agendar
                </button>
              </>
            )}
          </div>
        )}
        {!templateId && (audioGravado || imagemEscolhida) && corpo.trim() && (
          <label className="block">
            <span className="text-xs text-slate-400">Ordem de envio</span>
            <select
              value={ordemMidia}
              onChange={(e) => setOrdemMidia(e.target.value)}
              className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white outline-none focus:border-emerald-400"
            >
              <option value="depois">Texto primeiro, depois {audioGravado ? "o áudio" : "a imagem"}</option>
              <option value="antes">{audioGravado ? "Áudio" : "Imagem"} primeiro, depois o texto</option>
            </select>
          </label>
        )}
        <label className="block">
          <span className="text-xs text-slate-400">Enviar por</span>
          <select value={numeroId} onChange={(e) => setNumeroId(e.target.value)} className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white outline-none focus:border-emerald-400">
            <option value="">— Escolha —</option>
            {numbers.map((n) => (<option key={n.id} value={n.id}>{n.label}</option>))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-slate-400">Data e hora</span>
          <input type="datetime-local" value={dataHora} onChange={(e) => setDataHora(e.target.value)} className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400" />
        </label>
        {erro && <p className="text-xs text-red-500">{erro}</p>}
        <button disabled={salvando || recording} className="w-full bg-emerald-500 text-white rounded-lg py-2 text-sm font-medium hover:bg-emerald-600 disabled:opacity-50">
          {salvando ? "Agendando…" : recording ? "Pare a gravação primeiro" : "Agendar"}
        </button>
      </form>
    </div>
  );
}
