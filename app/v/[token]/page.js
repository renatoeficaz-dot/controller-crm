"use client";

import { useEffect, useRef, useState, use as usePromise } from "react";

// Página PÚBLICA (sem login) — o cliente abre pelo link mandado no WhatsApp.
// Fluxo: consentimento -> captura (câmera de trás, câmera da frente,
// localização, dispositivo) -> libera a sala de vídeo (Jitsi Meet público).
// Nada é capturado antes do cliente aceitar explicitamente.
export default function VideoChamadaPublica({ params }) {
  const { token } = usePromise(params);
  const [passo, setPasso] = useState("carregando"); // carregando | erro | consentimento | capturando | pronto | sala
  const [termosAbertos, setTermosAbertos] = useState(false);
  const [erro, setErro] = useState("");
  const [statusCaptura, setStatusCaptura] = useState(""); // texto de progresso durante a captura
  const [sala, setSala] = useState(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

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
      setErro("Não foi possível concluir a verificação. Confirme que deu permissão pra câmera e localização, e tente de novo.");
      setPasso("erro-captura");
    } finally {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    }
  }

  async function entrarNaSala() {
    const res = await fetch(`/api/video-chamada/${token}/entrar`, { method: "POST" });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setErro(d.error || "Não foi possível entrar na chamada."); return; }
    setSala(d.sala);
    setPasso("sala");
  }

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

  if (passo === "sala" && sala) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "#000" }}>
        <iframe
          title="Vídeo chamada"
          src={`https://meet.jit.si/${sala}#config.prejoinPageEnabled=false`}
          allow="camera; microphone; fullscreen; display-capture"
          style={{ width: "100%", height: "100%", border: 0 }}
        />
      </div>
    );
  }

  return null;
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
