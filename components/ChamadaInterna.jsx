"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Icone from "@/components/Icones";
import { ICE_SERVERS } from "@/lib/webrtcConfig";

// Janela da chamada entre dois usuários do sistema. Mesma base da vídeo
// chamada com o cliente: o servidor só retransmite oferta/resposta/ICE — o
// áudio e o vídeo vão direto entre os dois navegadores.
//
// `souQuemLigou` decide quem cria a oferta. Se os dois criassem, as duas
// negociações colidiriam ("glare") e nenhuma completaria.
export default function ChamadaInterna({ chamada, euId, onEncerrar }) {
  const souQuemLigou = chamada.deId === euId;
  const outro = souQuemLigou ? chamada.para : chamada.de;

  const [status, setStatus] = useState("conectando"); // conectando | falando | caiu
  const [mudo, setMudo] = useState(false);
  const [semCamera, setSemCamera] = useState(!chamada.video);
  const [compartilhando, setCompartilhando] = useState(false);
  const [erro, setErro] = useState("");

  const pcRef = useRef(null);
  const localRef = useRef(null);
  const remotoRef = useRef(null);
  const streamLocalRef = useRef(null);
  const telaRef = useRef(null);
  const videoSenderRef = useRef(null);
  const lidosRef = useRef(0);
  const pendentesRef = useRef([]);
  const encerradoRef = useRef(false);

  const enviarSinal = useCallback(
    (tipo, payload) =>
      fetch(`/api/chamadas/${chamada.id}/sinal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, payload }),
      }).catch(() => {}),
    [chamada.id]
  );

  const encerrar = useCallback(async () => {
    if (encerradoRef.current) return;
    encerradoRef.current = true;
    await enviarSinal("encerrar", null);
    await fetch(`/api/chamadas/${chamada.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "encerrar" }),
    }).catch(() => {});
    streamLocalRef.current?.getTracks().forEach((t) => t.stop());
    telaRef.current?.getTracks().forEach((t) => t.stop());
    pcRef.current?.close();
    onEncerrar?.();
  }, [chamada.id, enviarSinal, onEncerrar]);

  useEffect(() => {
    let vivo = true;
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;

    pc.ontrack = (e) => {
      if (remotoRef.current) remotoRef.current.srcObject = e.streams[0];
      setStatus("falando");
    };
    pc.onicecandidate = (e) => {
      if (e.candidate) enviarSinal("candidato", e.candidate);
    };
    pc.onconnectionstatechange = () => {
      if (["failed", "disconnected"].includes(pc.connectionState)) setStatus("caiu");
      if (pc.connectionState === "connected") setStatus("falando");
    };

    (async () => {
      // Áudio é obrigatório; vídeo é opcional. Sem esse fallback, quem não
      // tem webcam (ou negou a câmera) não conseguia nem falar.
      let stream = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: chamada.video });
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          setSemCamera(true);
        } catch {
          setErro("Não foi possível acessar o microfone.");
          return;
        }
      }
      if (!vivo) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamLocalRef.current = stream;
      if (localRef.current) localRef.current.srcObject = stream;
      for (const track of stream.getTracks()) {
        const sender = pc.addTrack(track, stream);
        if (track.kind === "video") videoSenderRef.current = sender;
      }

      if (souQuemLigou) {
        const oferta = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
        await pc.setLocalDescription(oferta);
        await enviarSinal("oferta", oferta);
      } else {
        await enviarSinal("pronto", null);
      }
    })();

    // Poll da sinalização. Candidatos que chegam antes da descrição remota
    // ficam na fila — aplicar antes disso o WebRTC recusa.
    const timer = setInterval(async () => {
      const d = await fetch(`/api/chamadas/${chamada.id}/sinal?apos=${lidosRef.current}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      if (!d || !vivo) return;
      lidosRef.current = d.total;

      for (const s of d.sinais) {
        const payload = s.payload ? JSON.parse(s.payload) : null;
        if (s.tipo === "oferta") {
          await pc.setRemoteDescription(new RTCSessionDescription(payload));
          const resposta = await pc.createAnswer();
          await pc.setLocalDescription(resposta);
          await enviarSinal("resposta", resposta);
          for (const c of pendentesRef.current) await pc.addIceCandidate(c).catch(() => {});
          pendentesRef.current = [];
        } else if (s.tipo === "resposta") {
          await pc.setRemoteDescription(new RTCSessionDescription(payload));
          for (const c of pendentesRef.current) await pc.addIceCandidate(c).catch(() => {});
          pendentesRef.current = [];
        } else if (s.tipo === "candidato" && payload) {
          const candidato = new RTCIceCandidate(payload);
          if (pc.remoteDescription) await pc.addIceCandidate(candidato).catch(() => {});
          else pendentesRef.current.push(candidato);
        } else if (s.tipo === "encerrar") {
          encerradoRef.current = true; // o outro já encerrou: não reenvia
          streamLocalRef.current?.getTracks().forEach((t) => t.stop());
          telaRef.current?.getTracks().forEach((t) => t.stop());
          pc.close();
          onEncerrar?.();
        }
      }
    }, 1500);

    return () => {
      vivo = false;
      clearInterval(timer);
      streamLocalRef.current?.getTracks().forEach((t) => t.stop());
      telaRef.current?.getTracks().forEach((t) => t.stop());
      pc.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chamada.id]);

  function alternarMudo() {
    const faixa = streamLocalRef.current?.getAudioTracks?.()[0];
    if (!faixa) return;
    faixa.enabled = !faixa.enabled;
    setMudo(!faixa.enabled);
  }

  function alternarCamera() {
    const faixa = streamLocalRef.current?.getVideoTracks?.()[0];
    if (!faixa) return;
    faixa.enabled = !faixa.enabled;
    setSemCamera(!faixa.enabled);
  }

  // Espelhar a tela: troca a faixa de vídeo que já está sendo enviada em vez
  // de renegociar a conexão inteira (replaceTrack não exige nova oferta).
  async function compartilharTela() {
    if (compartilhando) return pararTela();
    try {
      const tela = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      telaRef.current = tela;
      const faixa = tela.getVideoTracks()[0];
      if (videoSenderRef.current) await videoSenderRef.current.replaceTrack(faixa);
      else videoSenderRef.current = pcRef.current.addTrack(faixa, tela);
      if (localRef.current) localRef.current.srcObject = tela;
      setCompartilhando(true);
      // Parar pelo botão do próprio navegador também tem que voltar a câmera.
      faixa.onended = () => pararTela();
    } catch {
      setErro("Não foi possível compartilhar a tela.");
    }
  }

  async function pararTela() {
    telaRef.current?.getTracks().forEach((t) => t.stop());
    telaRef.current = null;
    const camera = streamLocalRef.current?.getVideoTracks?.()[0] || null;
    if (videoSenderRef.current) await videoSenderRef.current.replaceTrack(camera).catch(() => {});
    if (localRef.current) localRef.current.srcObject = streamLocalRef.current || null;
    setCompartilhando(false);
  }

  return (
    <div className="fixed inset-0 z-[90] bg-slate-900 flex flex-col">
      <div className="px-4 py-3 flex items-center gap-3 text-white border-b border-slate-700">
        <span className="w-9 h-9 rounded-full bg-emerald-600 flex items-center justify-center text-sm font-semibold">
          {(outro?.name || "?").slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium truncate">{outro?.name}</p>
          <p className="text-xs text-slate-400">
            {status === "conectando" && "Conectando…"}
            {status === "falando" && (compartilhando ? "Compartilhando a tela" : "Em chamada")}
            {status === "caiu" && "Conexão instável"}
          </p>
        </div>
      </div>

      <div className="flex-1 relative bg-black min-h-0">
        <video ref={remotoRef} autoPlay playsInline className="w-full h-full object-contain" />
        {status !== "falando" && (
          <p className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm">
            {status === "caiu" ? "A conexão caiu" : "Conectando…"}
          </p>
        )}
        <video
          ref={localRef}
          autoPlay
          playsInline
          muted
          className="absolute bottom-3 right-3 w-32 sm:w-44 rounded-lg border border-slate-700 bg-slate-800"
        />
      </div>

      {erro && <p className="px-4 py-2 text-xs text-red-300 bg-red-900/40">{erro}</p>}

      <div className="px-4 py-4 flex items-center justify-center gap-3 border-t border-slate-700">
        <button
          onClick={alternarMudo}
          title={mudo ? "Ativar microfone" : "Silenciar microfone"}
          className={`w-12 h-12 rounded-full flex items-center justify-center ${mudo ? "bg-red-600 text-white" : "bg-slate-700 text-white hover:bg-slate-600"}`}
        >
          <Icone nome="microfone" className="w-5 h-5" />
        </button>
        <button
          onClick={alternarCamera}
          title={semCamera ? "Ligar câmera" : "Desligar câmera"}
          className={`w-12 h-12 rounded-full flex items-center justify-center ${semCamera ? "bg-red-600 text-white" : "bg-slate-700 text-white hover:bg-slate-600"}`}
        >
          <Icone nome="video" className="w-5 h-5" />
        </button>
        <button
          onClick={compartilharTela}
          title={compartilhando ? "Parar de compartilhar" : "Compartilhar a tela"}
          className={`w-12 h-12 rounded-full flex items-center justify-center ${compartilhando ? "bg-sky-600 text-white" : "bg-slate-700 text-white hover:bg-slate-600"}`}
        >
          <Icone nome="monitor" className="w-5 h-5" />
        </button>
        <button
          onClick={encerrar}
          title="Desligar"
          className="w-14 h-12 rounded-full bg-red-600 text-white flex items-center justify-center hover:bg-red-700"
        >
          <Icone nome="cobranca" className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
