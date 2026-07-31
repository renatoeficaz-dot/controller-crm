"use client";

import { useEffect, useState, use as usePromise } from "react";

// Página PÚBLICA (sem login) de pré-cadastro — o lead preenche antes de ir
// pro WhatsApp. Link vem de /l/[slug] quando a campanha usa modoColeta =
// "formulario" ou "perguntar" (nesse caso, como uma das duas opções).
export default function FormularioPublico({ params }) {
  const { slug } = usePromise(params);
  const [dados, setDados] = useState(null);
  const [respostas, setRespostas] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [enviado, setEnviado] = useState(false);

  useEffect(() => {
    fetch(`/api/formulario/${slug}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setDados)
      .catch(() => setErro("Link inválido ou expirado."));
  }, [slug]);

  async function enviar(e) {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    const res = await fetch(`/api/formulario/${slug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ respostas }),
    });
    const d = await res.json().catch(() => ({}));
    setEnviando(false);
    if (!res.ok) { setErro(d.error || "Erro ao enviar."); return; }
    setEnviado(true);
    setTimeout(() => { window.location.href = d.whatsappUrl; }, 900);
  }

  if (erro && !dados) {
    return <Centro><p style={{ color: "#dc2626" }}>{erro}</p></Centro>;
  }
  if (!dados) return <Centro><p style={{ color: "#94a3b8" }}>Carregando…</p></Centro>;

  if (enviado) {
    return (
      <Centro>
        <p style={{ fontSize: 15, color: "#059669", fontWeight: 600 }}>Recebemos suas informações!</p>
        <p style={{ fontSize: 13, color: "#64748b", marginTop: 6 }}>Abrindo o WhatsApp…</p>
      </Centro>
    );
  }

  return (
    <Centro>
      <h1 style={{ fontSize: 18, color: "#1e293b", margin: "0 0 4px", fontWeight: 700 }}>{dados.nome}</h1>
      <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 20px" }}>Leva menos de 1 minuto.</p>
      <form onSubmit={enviar} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={campoLabel}>
          <span>Nome</span>
          <input
            required
            value={respostas.nome || ""}
            onChange={(e) => setRespostas((r) => ({ ...r, nome: e.target.value }))}
            style={inputStyle}
          />
        </label>
        <label style={campoLabel}>
          <span>WhatsApp (com DDD)</span>
          <input
            required
            type="tel"
            placeholder="11999998888"
            value={respostas.telefone || ""}
            onChange={(e) => setRespostas((r) => ({ ...r, telefone: e.target.value }))}
            style={inputStyle}
          />
        </label>
        {dados.campos.map((c) => (
          <label key={c.chave} style={campoLabel}>
            <span>{c.label}</span>
            <input
              type={c.tipo === "numero" ? "number" : c.tipo === "data" ? "date" : "text"}
              value={respostas[c.chave] || ""}
              onChange={(e) => setRespostas((r) => ({ ...r, [c.chave]: e.target.value }))}
              style={inputStyle}
            />
          </label>
        ))}
        {erro && <p style={{ color: "#dc2626", fontSize: 13 }}>{erro}</p>}
        <button
          disabled={enviando}
          style={{
            background: "#10b981", color: "#fff", border: "none", borderRadius: 10,
            padding: "12px", fontWeight: 600, fontSize: 14, cursor: "pointer", opacity: enviando ? 0.6 : 1,
          }}
        >
          {enviando ? "Enviando…" : "Continuar"}
        </button>
      </form>
    </Centro>
  );
}

function Centro({ children }) {
  return (
    <div style={{ fontFamily: "system-ui,-apple-system,sans-serif", background: "#f2f3f8", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: "28px 24px", maxWidth: 380, width: "100%", boxShadow: "0 4px 20px rgba(0,0,0,.08)" }}>
        {children}
      </div>
    </div>
  );
}

const campoLabel = { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#475569", fontWeight: 500 };
const inputStyle = { border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 12px", fontSize: 14, outline: "none" };
