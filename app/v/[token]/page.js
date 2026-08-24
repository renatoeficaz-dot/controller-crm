"use client";

import { useEffect, useRef, useState, use as usePromise } from "react";
import { ICE_SERVERS } from "@/lib/webrtcConfig";

// Página PÚBLICA (sem login) — o cliente abre pelo link mandado no WhatsApp.
// Fluxo: consentimento -> captura (câmera de trás, câmera da frente,
// localização, dispositivo) -> vídeo chamada nativa (WebRTC P2P direto com o
// atendente, sinalização via poll em /api/video-chamada/[token]/sinal — ver
// esse arquivo pra entender o protocolo de troca de oferta/resposta/ICE).
// Nada é capturado antes do cliente aceitar explicitamente.
export default function VideoChamadaPublica({ params }) {
  const { token } = usePromise(params);
  const [passo, setPasso] = useState("carregando"); // carregando | erro | consentimento | capturando | pronto | chamando | sala | encerrada
  const [termosAbertos, setTermosAbertos] = useState(false);
  const [erro, setErro] = useState("");
  const [statusCaptura, setStatusCaptura] = useState(""); // texto de progresso durante a captura
  const [micLigado, setMicLigado] = useState(true);
  const [camLigada, setCamLigada] = useState(true);
  const videoRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const streamRef = useRef(null);
  const pcRef = useRef(null);
  const sinaisVistosRef = useRef(0);
  const pollRef = useRef(null);
  const candidatosPendentesRef = useRef([]);

  useEffect(() => {
    fetch(`/api/video-chamada/${token}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (d.entrouNaSala || d.capturado) setPasso("pronto");
        else if (d.aceito) setPasso("capturando");
        else setPasso("consentimento");
      })
      .catch(() => {
        setErro("Link inválido ou expirado.");
        setPasso("erro");
      });
  }, [token]);

  async function aceitar() {
    const res = await fetch(`/api/video-chamada/${token}/aceitar`, { method: "POST" });
    if (!res.ok) { setErro("Não foi possível continuar. Tente de novo."); return; }
    setPasso("capturando");
    iniciarCaptura();
  }

  // Tira uma foto de uma câmera (facingMode "environment" = de trás, "user" =
  // da frente) e devolve o base64 (sem o prefixo data:...). null se essa
  // câmera não existir/não puder ser acessada — não trava o fluxo por isso
  // (ex.: notebook só tem uma câmera).
  async function tirarFoto(facingMode) {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facingMode } } });
    } catch {
      return null;
    }
    streamRef.current = stream;
    const video = videoRef.current;
    video.srcObject = stream;
    await video.play().catch(() => {});
    // Espera o vídeo ter pelo menos um frame real pra não fotografar tela preta.
    await new Promise((resolve) => {
      if (video.videoWidth) return resolve();
      video.onloadedmetadata = () => resolve();
      setTimeout(resolve, 1500);
    });
    await new Promise((r) => setTimeout(r, 400)); // dá tempo da câmera ajustar exposição/foco
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    stream.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    return canvas.toDataURL("image/jpeg", 0.85).split(",")[1] || null;
  }

  function pegarLocalizacao() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        () => resolve(null),
        { timeout: 8000 }
      );
    });
  }

  async function iniciarCaptura() {
    try {
      setStatusCaptura("Abrindo a câmera de trás…");
      const fotoTrasBase64 = await tirarFoto("environment");

      setStatusCaptura("Abrindo a câmera da frente…");
      const fotoFrenteBase64 = await tirarFoto("user");

      // tirarFoto() nunca rejeita (engole o erro e devolve null) — sem essa
      // checagem, negar a câmera nas duas fotos passava direto pro "Tudo
      // certo!" sem nunca ter capturado nada, e o cliente nem ficava sabendo.
      if (!fotoTrasBase64 && !fotoFrenteBase64) {
        throw new Error("sem_camera");
      }

      setStatusCaptura("Pegando sua localização…");
      const loc = await pegarLocalizacao();

      setStatusCaptura("Enviando…");
      await fetch(`/api/video-chamada/${token}/capturar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fotoTrasBase64,
          fotoFrenteBase64,
          latitude: loc?.latitude,
          longitude: loc?.longitude,
          dispositivo: navigator.userAgent,
        }),
      });
      setPasso("pronto");
    } catch {
      setErro("Não foi possível acessar a câmera. Confirme a permissão de câmera pra esse site nas configurações do navegador e tente de novo.");
      setPasso("erro-captura");
    } finally {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    }
  }

  async function mandarSinal(tipo, payload) {
    await fetch(`/api/video-chamada/${token}/sinal`, {
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
      if (pc.connectionState === "connected") setPasso("sala");
      // O atendente pode cair de rede sem mandar "encerrar" explícito — sem
      // isso o cliente ficava preso pra sempre na tela "chamando". A própria
      // encerrarChamada é o guarda de idempotência (via pcRef.current null).
      if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
        encerrarChamada(false);
      }
    };
    pcRef.current = pc;
    return pc;
  }

  async function processarSinal(s) {
    const pc = pcRef.current;
    if (!pc) return;
    const payload = s.payload ? JSON.parse(s.payload) : null;
    if (s.tipo === "oferta") {
      await pc.setRemoteDescription(new RTCSessionDescription(payload));
      for (const c of candidatosPendentesRef.current) await pc.addIceCandidate(c).catch(() => {});
      candidatosPendentesRef.current = [];
      const resposta = await pc.createAnswer();
      await pc.setLocalDescription(resposta);
      mandarSinal("resposta", resposta);
    } else if (s.tipo === "candidato") {
      const candidato = new RTCIceCandidate(payload);
      if (pc.remoteDescription) await pc.addIceCandidate(candidato).catch(() => {});
      else candidatosPendentesRef.current.push(candidato);
    } else if (s.tipo === "encerrar") {
      encerrarChamada(false);
    }
  }

  function iniciarPoll() {
    pollRef.current = setInterval(async () => {
      const d = await fetch(`/api/video-chamada/${token}/sinal?apos=${sinaisVistosRef.current}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      if (!d?.sinais?.length) return;
      sinaisVistosRef.current = d.total;
      for (const s of d.sinais) await processarSinal(s);
    }, 1200);
  }

  async function entrarNaSala() {
    const res = await fetch(`/api/video-chamada/${token}/entrar`, { method: "POST" });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setErro(d.error || "Não foi possível entrar na chamada."); return; }

    try {
      // Pede câmera+microfone juntos primeiro; se o navegador negar por causa
      // só de UM dos dois (ex.: microfone bloqueado nas configurações do
      // site, câmera liberada), pedir os dois juntos rejeita tudo — cair pra
      // só vídeo (ou só áudio) deixa a chamada acontecer mesmo assim, em vez
      // de travar o cliente inteiro por causa de uma permissão só.
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
      setErro("Não foi possível acessar câmera nem microfone pra vídeo chamada. Confirme a permissão desse site nas configurações do navegador e tente de novo.");
      setPasso("erro-chamada");
      return;
    }

    setPasso("chamando");
    await mandarSinal("pronto", null);
    iniciarPoll();
  }

  function encerrarChamada(avisar = true) {
    if (!pcRef.current && !streamRef.current) return; // já encerrada, evita disparar 2x
    if (avisar) mandarSinal("encerrar", null);
    if (pollRef.current) clearInterval(pollRef.current);
    pcRef.current?.close();
    pcRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setPasso("encerrada");
  }

  function alternarMic() {
    streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !t.enabled));
    setMicLigado((v) => !v);
  }
  function alternarCam() {
    streamRef.current?.getVideoTracks().forEach((t) => (t.enabled = !t.enabled));
    setCamLigada((v) => !v);
  }

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pcRef.current?.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  if (passo === "carregando") {
    return <Centro><p style={{ color: "#94a3b8" }}>Carregando…</p></Centro>;
  }

  if (passo === "erro") {
    return <Centro><p style={{ color: "#dc2626" }}>{erro}</p></Centro>;
  }

  if (passo === "consentimento") {
    return (
      <Centro>
        <h1 style={titulo}>Vídeo chamada</h1>
        <p style={{ fontSize: 14, color: "#334155", lineHeight: 1.6, margin: "0 0 20px" }}>
          Antes de entrar na vídeo chamada, precisamos confirmar sua identidade.
        </p>
        <button onClick={() => setTermosAbertos(true)} style={botaoPrimario}>Termos de vídeo chamada</button>

        {termosAbertos && (
          <div
            style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 10 }}
            onClick={() => setTermosAbertos(false)}
          >
            <div
              style={{ maxWidth: 380, width: "100%", background: "#fff", borderRadius: 16, padding: "24px 22px", boxShadow: "0 10px 30px rgba(0,0,0,0.2)", textAlign: "left", maxHeight: "85vh", overflowY: "auto" }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 style={{ ...titulo, fontSize: 16 }}>Termos de vídeo chamada</h2>
              <p style={{ fontSize: 14, color: "#334155", lineHeight: 1.6, margin: "0 0 10px" }}>
                Antes de entrar na vídeo chamada, precisamos confirmar que é realmente você quem está do outro lado — é uma etapa de segurança padrão pra evitar fraude e proteger tanto você quanto a operação.
              </p>
              <p style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6, margin: "0 0 14px" }}>
                Essa confirmação é feita uma única vez, leva menos de um minuto e as informações coletadas são usadas apenas para verificação de identidade — não são compartilhadas com terceiros e ficam vinculadas só ao seu atendimento.
              </p>
              <p style={{ fontSize: 12, color: "#475569", fontWeight: 600, margin: "0 0 6px" }}>O que será coletado:</p>
              <ul style={{ fontSize: 12, color: "#64748b", lineHeight: 1.6, margin: "0 0 16px", paddingLeft: 18 }}>
                <li>Uma foto com a câmera de trás e outra com a da frente</li>
                <li>Sua localização</li>
                <li>Informações do seu aparelho</li>
              </ul>
              <p style={{ fontSize: 11, color: "#94a3b8", margin: "0 0 20px" }}>
                Isso só acontece se você aceitar. Sem essa confirmação não é possível continuar pra vídeo chamada.
              </p>
              <button onClick={aceitar} style={botaoPrimario}>Aceitar e continuar</button>
              <button
                onClick={() => setTermosAbertos(false)}
                style={{ width: "100%", background: "transparent", color: "#64748b", border: 0, padding: "10px 16px", fontSize: 13, cursor: "pointer", marginTop: 4 }}
              >
                Voltar
              </button>
            </div>
          </div>
        )}
      </Centro>
    );
  }

  if (passo === "capturando") {
    return (
      <Centro>
        <p style={{ fontSize: 14, color: "#334155", marginBottom: 10 }}>{statusCaptura || "Preparando…"}</p>
        <video ref={videoRef} muted playsInline style={{ width: 1, height: 1, opacity: 0, position: "absolute" }} />
        <Spinner />
      </Centro>
    );
  }

  if (passo === "erro-captura") {
    return (
      <Centro>
        <p style={{ color: "#dc2626", marginBottom: 16 }}>{erro}</p>
        <button onClick={() => { setPasso("capturando"); iniciarCaptura(); }} style={botaoPrimario}>Tentar de novo</button>
      </Centro>
    );
  }

  if (passo === "erro-chamada") {
    return (
      <Centro>
        <p style={{ color: "#dc2626", marginBottom: 16 }}>{erro}</p>
        <button onClick={() => { setPasso("pronto"); entrarNaSala(); }} style={botaoPrimario}>Tentar de novo</button>
      </Centro>
    );
  }

  if (passo === "pronto") {
    return (
      <Centro>
        <h1 style={titulo}>Tudo certo!</h1>
        <p style={{ fontSize: 14, color: "#334155", margin: "0 0 20px" }}>Já confirmamos suas informações. Pode entrar na vídeo chamada.</p>
        <video ref={videoRef} muted playsInline style={{ width: 1, height: 1, opacity: 0, position: "absolute" }} />
        <button onClick={entrarNaSala} style={botaoPrimario}>Entrar na vídeo chamada</button>
      </Centro>
    );
  }

  if (passo === "chamando" || passo === "sala") {
    return (
      <div style={{ position: "fixed", inset: 0, background: "#0f172a" }}>
        <video ref={remoteVideoRef} autoPlay playsInline style={{ width: "100%", height: "100%", objectFit: "cover", background: "#0f172a" }} />
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          style={{ position: "absolute", top: 16, right: 16, width: 110, height: 150, objectFit: "cover", borderRadius: 12, border: "2px solid rgba(255,255,255,0.25)" }}
        />
        {passo === "chamando" && (
          <div style={{ position: "absolute", top: 16, left: 16, background: "rgba(15,23,42,0.75)", color: "#fff", fontSize: 13, padding: "8px 14px", borderRadius: 999 }}>
            Aguardando o atendente entrar…
          </div>
        )}
        <div style={{ position: "absolute", bottom: 28, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 14 }}>
          <button onClick={alternarMic} style={botaoRedondo(micLigado)} title={micLigado ? "Desligar microfone" : "Ligar microfone"}>
            {micLigado ? "🎤" : "🔇"}
          </button>
          <button onClick={alternarCam} style={botaoRedondo(camLigada)} title={camLigada ? "Desligar câmera" : "Ligar câmera"}>
            {camLigada ? "📷" : "🚫"}
          </button>
          <button onClick={() => encerrarChamada(true)} style={{ ...botaoRedondo(true), background: "#dc2626" }} title="Encerrar chamada">
            ✕
          </button>
        </div>
      </div>
    );
  }

  if (passo === "encerrada") {
    return (
      <Centro>
        <h1 style={titulo}>Chamada encerrada</h1>
        <p style={{ fontSize: 14, color: "#334155" }}>Você já pode fechar esta janela.</p>
      </Centro>
    );
  }

  return null;
}

function botaoRedondo(ativo) {
  return {
    width: 52, height: 52, borderRadius: "50%", border: 0, fontSize: 20,
    background: ativo ? "rgba(255,255,255,0.15)" : "#475569", color: "#fff", cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
  };
}

function Centro({ children }) {
  return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "#f8fafc" }}>
      <div style={{ maxWidth: 380, width: "100%", background: "#fff", borderRadius: 16, padding: "28px 24px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", textAlign: "center" }}>
        {children}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ width: 28, height: 28, margin: "0 auto", border: "3px solid #e2e8f0", borderTopColor: "#10b981", borderRadius: "50%", animation: "girar 0.8s linear infinite" }}>
      <style>{"@keyframes girar { to { transform: rotate(360deg); } }"}</style>
    </div>
  );
}

const titulo = { fontSize: 18, color: "#1e293b", margin: "0 0 12px", fontWeight: 700 };
const botaoPrimario = {
  width: "100%", background: "#10b981", color: "#fff", border: 0, borderRadius: 10,
  padding: "12px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer",
};
