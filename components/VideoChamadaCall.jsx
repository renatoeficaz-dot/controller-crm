"use client";

import { useEffect, useRef, useState } from "react";
import { ICE_SERVERS } from "@/lib/webrtcConfig";
import Icone from "@/components/Icones";

// Lado do ATENDENTE da vídeo chamada nativa (WebRTC P2P) — espelha a lógica
// de app/v/[token]/page.js do lado do cliente. O atendente é sempre quem
// cria a OFERTA (assim que vê o sinal "pronto" do cliente), o cliente sempre
// RESPONDE — papel fixo pra não precisar negociar quem inicia.
export default function VideoChamadaCall({ sessaoId, onClose }) {
  const [status, setStatus] = useState("carregando"); // carregando | aguardando-entrar | aguardando-cliente | conectando | conectado | encerrada | erro
  const [contactName, setContactName] = useState("");
  const [micLigado, setMicLigado] = useState(true);
  const [camLigada, setCamLigada] = useState(true);
  const [erro, setErro] = useState("");
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const streamRef = useRef(null);
  const pcRef = useRef(null);
  const sinaisVistosRef = useRef(0);
  const pollRef = useRef(null);
  const candidatosPendentesRef = useRef([]);
  const ofertaEnviadaRef = useRef(false);

  useEffect(() => {
    fetch(`/api/video-chamada-staff/${sessaoId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        setContactName(d.contactName || "");
        setStatus("aguardando-entrar");
      })
      .catch(() => {
        setErro("Não foi possível carregar a sessão.");
        setStatus("erro");
      });
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pcRef.current?.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [sessaoId]);

  async function mandarSinal(tipo, payload) {
    await fetch(`/api/video-chamada-staff/${sessaoId}/sinal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo, payload }),
    }).catch(() => {});
  }

  function criarPeerConnection() {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pc.onicecandidate = (e) => {
      if (e.candidate) mandarSinal("candidato", e.candidate.toJSON());
    };
    pc.ontrack = (e) => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0];
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") setStatus("conectado");
      if (["failed", "disconnected", "closed"].includes(pc.connectionState)) encerrar(false);
    };
    pcRef.current = pc;
    return pc;
  }

  async function processarSinal(s) {
    const pc = pcRef.current;
    if (!pc) return;
    const payload = s.payload ? JSON.parse(s.payload) : null;
    if (s.tipo === "pronto") {
      // Cliente entrou na tela de chamada — só o atendente cria oferta, e só
      // uma vez (reentrar da própria página do cliente não deve reabrir).
      if (ofertaEnviadaRef.current) return;
      ofertaEnviadaRef.current = true;
      setStatus("conectando");
      const oferta = await pc.createOffer();
      await pc.setLocalDescription(oferta);
      mandarSinal("oferta", oferta);
    } else if (s.tipo === "resposta") {
      await pc.setRemoteDescription(new RTCSessionDescription(payload));
      for (const c of candidatosPendentesRef.current) await pc.addIceCandidate(c).catch(() => {});
      candidatosPendentesRef.current = [];
    } else if (s.tipo === "candidato") {
      const candidato = new RTCIceCandidate(payload);
      if (pc.remoteDescription) await pc.addIceCandidate(candidato).catch(() => {});
      else candidatosPendentesRef.current.push(candidato);
    } else if (s.tipo === "encerrar") {
      encerrar(false);
    }
  }

  function iniciarPoll() {
    pollRef.current = setInterval(async () => {
      const d = await fetch(`/api/video-chamada-staff/${sessaoId}/sinal?apos=${sinaisVistosRef.current}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      if (!d?.sinais?.length) return;
      sinaisVistosRef.current = d.total;
      for (const s of d.sinais) await processarSinal(s);
    }, 1200);
  }

  async function entrarNaChamada() {
    try {
      // Pede os dois juntos primeiro; se só um dos dois estiver bloqueado
      // (ex.: microfone negado, câmera liberada), pedir junto rejeita tudo —
      // cair pra só vídeo (ou só áudio) evita travar a chamada por causa de
      // uma permissão só.
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
        }
      }
      streamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      const pc = criarPeerConnection();
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    } catch {
      setErro("Não foi possível acessar câmera nem microfone. Confirme a permissão desse site nas configurações do navegador.");
      setStatus("erro");
      return;
    }
    setStatus("aguardando-cliente");
    iniciarPoll();
  }

  function encerrar(avisar = true) {
    if (!pcRef.current && !streamRef.current) { onClose(); return; }
    if (avisar) mandarSinal("encerrar", null);
    if (pollRef.current) clearInterval(pollRef.current);
    pcRef.current?.close();
    pcRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStatus("encerrada");
  }

  function alternarMic() {
    streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !t.enabled));
    setMicLigado((v) => !v);
  }
  function alternarCam() {
    streamRef.current?.getVideoTracks().forEach((t) => (t.enabled = !t.enabled));
    setCamLigada((v) => !v);
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 flex items-center justify-center p-4">
      <div className="bg-slate-950 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900">
          <span className="text-sm text-slate-200 font-medium">Vídeo chamada{contactName ? ` — ${contactName}` : ""}</span>
          <button onClick={() => (status === "conectado" || status === "conectando" || status === "aguardando-cliente" ? encerrar(true) : onClose())} className="text-slate-400 hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="relative bg-black" style={{ aspectRatio: "4/3" }}>
          {(status === "conectando" || status === "aguardando-cliente" || status === "conectado") && (
            <>
              <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover bg-slate-900" />
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="absolute top-3 right-3 rounded-lg border-2 border-white/20 object-cover"
                style={{ width: 110, height: 150 }}
              />
              {status !== "conectado" && (
                <div className="absolute top-3 left-3 bg-slate-900/75 text-white text-xs px-3 py-1.5 rounded-full">
                  {status === "aguardando-cliente" ? "Aguardando o cliente entrar…" : "Conectando…"}
                </div>
              )}
              <div className="absolute bottom-5 left-0 right-0 flex justify-center gap-3">
                <button onClick={alternarMic} className={`w-11 h-11 rounded-full flex items-center justify-center text-white ${micLigado ? "bg-white/15" : "bg-slate-600"}`} title={micLigado ? "Desligar microfone" : "Ligar microfone"}>
                  <Icone nome="fone" className="w-4 h-4" />
                </button>
                <button onClick={alternarCam} className={`w-11 h-11 rounded-full flex items-center justify-center text-white ${camLigada ? "bg-white/15" : "bg-slate-600"}`} title={camLigada ? "Desligar câmera" : "Ligar câmera"}>
                  <Icone nome="video" className="w-4 h-4" />
                </button>
                <button onClick={() => encerrar(true)} className="w-11 h-11 rounded-full flex items-center justify-center text-white bg-red-600" title="Encerrar chamada">
                  <Icone nome="x" className="w-4 h-4" />
                </button>
              </div>
            </>
          )}

          {status === "aguardando-entrar" && (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-slate-300 text-sm">
                O link já foi mandado pro cliente. Quando você entrar, a chamada conecta automaticamente assim que ele passar pela verificação.
              </p>
              <button onClick={entrarNaChamada} className="bg-emerald-500 text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-emerald-600">
                Entrar na chamada
              </button>
            </div>
          )}

          {status === "carregando" && (
            <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">Carregando…</div>
          )}

          {status === "erro" && (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-red-400 text-sm">{erro}</p>
              <button onClick={entrarNaChamada} className="bg-emerald-500 text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-emerald-600">
                Tentar de novo
              </button>
              <button onClick={onClose} className="text-slate-300 text-sm underline">Fechar</button>
            </div>
          )}

          {status === "encerrada" && (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-slate-300 text-sm">Chamada encerrada.</p>
              <button onClick={onClose} className="bg-slate-700 text-white text-sm rounded-lg px-4 py-2 hover:bg-slate-600">Fechar</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
