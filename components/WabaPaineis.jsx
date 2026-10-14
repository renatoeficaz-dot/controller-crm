"use client";

import { useEffect, useRef, useState } from "react";

// Painéis da API OFICIAL do WhatsApp (WABA / Cloud API da Meta) em Configurações → Números.
//  - CartaoWabaApp: dados do app na Meta (App ID/Secret, Verify Token, Config ID do Cadastro Integrado, template fora da janela).
//  - PainelWabaNumero: credenciais de UM número + Cadastro Integrado (coexistência com o app WhatsApp Business do celular).

const input = "mt-1 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-shadow";

function Campo({ label, value, onChange, placeholder, type = "text", dica, readOnly }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <input type={type} value={value} readOnly={readOnly} onChange={(e) => onChange?.(e.target.value)} placeholder={placeholder} className={input + (readOnly ? " bg-slate-50 text-slate-500" : "")} />
      {dica && <span className="block text-[11px] text-slate-400 mt-1">{dica}</span>}
    </label>
  );
}

function copiar(texto) {
  try { navigator.clipboard?.writeText(texto); } catch { /* sem permissão: o usuário copia na mão */ }
}

export function CartaoWabaApp() {
  const [cfg, setCfg] = useState(null);
  const [aberto, setAberto] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [teste, setTeste] = useState(null);
  const [testando, setTestando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    fetch("/api/config").then((r) => r.json()).then((c) => setCfg({
      wabaAppId: c.wabaAppId || "",
      wabaAppSecret: c.wabaAppSecret || "",
      wabaVerifyToken: c.wabaVerifyToken || "",
      wabaConfigId: c.wabaConfigId || "",
      wabaGraphVersion: c.wabaGraphVersion || "v23.0",
      wabaTemplateForaJanela: c.wabaTemplateForaJanela || "",
      wabaTemplateIdioma: c.wabaTemplateIdioma || "pt_BR",
    })).catch(() => setCfg(null));
  }, []);

  if (!cfg) return null;
  const webhookUrl = typeof window !== "undefined" ? `${window.location.origin}/api/webhook/waba` : "/api/webhook/waba";
  const set = (k) => (v) => setCfg((s) => ({ ...s, [k]: v }));

  async function salvar(e) {
    e.preventDefault();
    setErro("");
    const r = await fetch("/api/config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cfg) });
    if (!r.ok) { setErro("Não foi possível salvar."); return; }
    setSalvo(true);
    setTimeout(() => setSalvo(false), 1500);
  }

  async function testar() {
    setTestando(true);
    setTeste(null);
    const r = await fetch("/api/config/test-waba", { method: "POST" }).then((x) => x.json()).catch((e) => ({ ok: false, error: e.message }));
    setTestando(false);
    setTeste(r);
  }

  const configurado = !!(cfg.wabaAppId && cfg.wabaAppSecret);

  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-800">WABA — API oficial do WhatsApp (Meta)</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {configurado ? "App da Meta configurado. Cadastre cada número com o provedor “WABA”." : "Sem bloqueio de número: usa a Cloud API da Meta (com coexistência com o app WhatsApp Business)."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setAberto((a) => !a)} className="text-xs font-medium border border-slate-200 rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-50 transition-colors">
            {aberto ? "Fechar" : "Configurar app da Meta"}
          </button>
          <button type="button" onClick={testar} disabled={testando || !configurado} className="text-xs font-medium border border-slate-200 rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50">
            {testando ? "Testando…" : "Testar app"}
          </button>
        </div>
      </div>
      {teste && (
        <p className={`mt-3 text-xs rounded-lg p-2.5 ${teste.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
          {teste.ok ? "✓ App ID e App Secret aceitos pela Meta." : `✗ ${teste.error || "Falha ao testar."}`}
        </p>
      )}
      {aberto && (
        <form onSubmit={salvar} className="mt-4 space-y-3">
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600 space-y-1.5">
            <p className="font-medium text-slate-700">No painel da Meta (developers.facebook.com → seu app → WhatsApp → Configuração):</p>
            <p>1. <b>URL de callback</b>: <code className="bg-white border border-slate-200 rounded px-1">{webhookUrl}</code> <button type="button" onClick={() => copiar(webhookUrl)} className="text-emerald-600 underline">copiar</button></p>
            <p>2. <b>Token de verificação</b>: o valor abaixo <button type="button" onClick={() => copiar(cfg.wabaVerifyToken)} className="text-emerald-600 underline">copiar</button></p>
            <p>3. Assine os campos <b>messages</b> e, para a coexistência, <b>smb_message_echoes</b> (e opcionalmente <b>history</b> e <b>smb_app_state_sync</b>).</p>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <Campo label="App ID" value={cfg.wabaAppId} onChange={set("wabaAppId")} placeholder="ex.: 1234567890123456" />
            <Campo label="App Secret" type="password" value={cfg.wabaAppSecret} onChange={set("wabaAppSecret")} placeholder="segredo do app" dica="Também valida a assinatura do webhook." />
            <Campo label="Token de verificação do webhook" value={cfg.wabaVerifyToken} onChange={set("wabaVerifyToken")} />
            <Campo label="Config ID do Cadastro Integrado" value={cfg.wabaConfigId} onChange={set("wabaConfigId")} placeholder="ex.: 9876543210" dica="Criado em Login do Facebook para Empresas → Configurações → Cadastro Integrado do WhatsApp. Habilita o botão de conectar/coexistência." />
            <Campo label="Template fora da janela de 24h" value={cfg.wabaTemplateForaJanela} onChange={set("wabaTemplateForaJanela")} placeholder="ex.: retomar_atendimento" dica="Template aprovado com UMA variável no corpo ({{1}} recebe o texto). Sem ele, o sistema não consegue falar com cliente que não escreveu nas últimas 24h." />
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Idioma do template" value={cfg.wabaTemplateIdioma} onChange={set("wabaTemplateIdioma")} placeholder="pt_BR" />
              <Campo label="Versão da Graph API" value={cfg.wabaGraphVersion} onChange={set("wabaGraphVersion")} placeholder="v23.0" />
            </div>
          </div>
          {erro && <p className="text-xs text-red-600">{erro}</p>}
          <button className="bg-slate-800 text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-slate-700 transition-colors">{salvo ? "Salvo ✓" : "Salvar"}</button>
        </form>
      )}
    </div>
  );
}

// Carrega o SDK do Facebook uma única vez.
function carregarSdkFacebook(appId, versao) {
  return new Promise((resolve, reject) => {
    if (window.FB) { resolve(window.FB); return; }
    window.fbAsyncInit = () => {
      window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version: versao || "v23.0" });
      resolve(window.FB);
    };
    const s = document.createElement("script");
    s.src = "https://connect.facebook.net/pt_BR/sdk.js";
    s.async = true;
    s.defer = true;
    s.onerror = () => reject(new Error("Não foi possível carregar o SDK do Facebook (bloqueador de anúncios?)."));
    document.body.appendChild(s);
  });
}

export function PainelWabaNumero({ n, onSalvo }) {
  const [f, setF] = useState({
    wabaPhoneNumberId: n.wabaPhoneNumberId || "",
    wabaBusinessAccountId: n.wabaBusinessAccountId || "",
    wabaAccessToken: "",
    wabaCoexistence: !!n.wabaCoexistence,
    wabaTemplateForaJanela: n.wabaTemplateForaJanela || "",
  });
  const [info, setInfo] = useState(null);
  const [msg, setMsg] = useState(null); // { ok, texto }
  const [ocupado, setOcupado] = useState(false);
  const pendente = useRef({ code: null, ids: null });

  async function carregarInfo() {
    const d = await fetch(`/api/numbers/${n.id}/waba`).then((r) => r.json()).catch(() => null);
    setInfo(d && !d.error ? d : null);
  }
  useEffect(() => { carregarInfo(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [n.id]);

  async function salvar() {
    setOcupado(true);
    setMsg(null);
    const corpo = { ...f };
    if (!corpo.wabaAccessToken) delete corpo.wabaAccessToken; // em branco = mantém o token salvo
    const r = await fetch(`/api/numbers/${n.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    setOcupado(false);
    if (!r.ok) { setMsg({ ok: false, texto: "Não foi possível salvar." }); return; }
    setF((s) => ({ ...s, wabaAccessToken: "" }));
    setMsg({ ok: true, texto: "Dados salvos." });
    onSalvo?.();
    carregarInfo();
  }

  async function verificar() {
    setOcupado(true);
    setMsg(null);
    const r = await fetch(`/api/numbers/${n.id}/connect`, { method: "POST" });
    const d = await r.json().catch(() => ({}));
    setOcupado(false);
    if (r.ok && d.connected) setMsg({ ok: true, texto: `Conectado${d.info?.nome ? " — " + d.info.nome : ""}${d.info?.numero ? " (" + d.info.numero + ")" : ""}${d.info?.qualidade ? " · qualidade " + d.info.qualidade : ""}.` });
    else setMsg({ ok: false, texto: d.error || "Não foi possível confirmar o número na Meta." });
    onSalvo?.();
    carregarInfo();
  }

  // Cadastro Integrado (Embedded Signup). Com "coexistência", o número continua no app WhatsApp Business do celular.
  async function cadastroIntegrado() {
    setMsg(null);
    if (!info?.cadastroIntegradoPronto) { setMsg({ ok: false, texto: "Preencha App ID, App Secret e Config ID em “WABA — API oficial” (acima) antes." }); return; }
    setOcupado(true);
    try {
      const FB = await carregarSdkFacebook(info.appId, "v23.0");
      pendente.current = { code: null, ids: null };
      const finalizar = async () => {
        const { code, ids } = pendente.current;
        if (!code || !ids) return;
        pendente.current = { code: null, ids: null };
        const r = await fetch(`/api/numbers/${n.id}/waba`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, phoneNumberId: ids.phone_number_id, wabaId: ids.waba_id, coexistencia: f.wabaCoexistence }) });
        const d = await r.json().catch(() => ({}));
        setOcupado(false);
        setMsg(r.ok ? { ok: true, texto: "Número conectado pela Meta. Confira o estado abaixo." } : { ok: false, texto: d.error || "Falha ao finalizar o cadastro." });
        onSalvo?.();
        carregarInfo();
      };
      const ouvir = (ev) => {
        if (!/facebook\.com$/.test(new URL(ev.origin).hostname)) return;
        let dados = ev.data;
        if (typeof dados === "string") { try { dados = JSON.parse(dados); } catch { return; } }
        if (dados?.type !== "WA_EMBEDDED_SIGNUP") return;
        if (String(dados.event || "").startsWith("FINISH")) { pendente.current.ids = dados.data || {}; finalizar(); }
        else if (dados.event === "CANCEL") { setOcupado(false); setMsg({ ok: false, texto: "Cadastro cancelado." }); }
      };
      window.addEventListener("message", ouvir);
      FB.login((resp) => {
        if (resp?.authResponse?.code) { pendente.current.code = resp.authResponse.code; finalizar(); }
        else { setOcupado(false); setMsg({ ok: false, texto: "A Meta não autorizou o cadastro." }); }
      }, {
        config_id: info.configId,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {}, featureType: f.wabaCoexistence ? "whatsapp_business_app_onboarding" : "", sessionInfoVersion: "3" },
      });
    } catch (err) {
      setOcupado(false);
      setMsg({ ok: false, texto: err.message });
    }
  }

  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const estado = info?.info;

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3.5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-700">API oficial (WABA)</p>
        {estado && (
          <span className={`text-[11px] font-medium rounded-full px-2 py-0.5 ${estado.state === "open" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
            {estado.state === "open" ? "Conectado" : "Desconectado"}{estado.qualidade ? ` · ${estado.qualidade}` : ""}
          </span>
        )}
      </div>
      {estado?.erro && <p className="text-[11px] text-red-600">{estado.erro}</p>}
      <div className="grid gap-3">
        <Campo label="Phone Number ID" value={f.wabaPhoneNumberId} onChange={set("wabaPhoneNumberId")} placeholder="ex.: 109876543210987" dica="Meta → WhatsApp → Configuração da API. Não é o telefone." />
        <Campo label="WhatsApp Business Account ID (WABA ID)" value={f.wabaBusinessAccountId} onChange={set("wabaBusinessAccountId")} placeholder="ex.: 102938475610293" />
        <Campo label="Token de acesso" type="password" value={f.wabaAccessToken} onChange={set("wabaAccessToken")} placeholder={n.wabaAccessToken ? "•••••• (salvo — deixe em branco para manter)" : "token permanente do usuário do sistema"} dica="Use um token permanente (usuário do sistema) para não expirar." />
        <Campo label="Template deste número fora da janela de 24h (opcional)" value={f.wabaTemplateForaJanela} onChange={set("wabaTemplateForaJanela")} placeholder="vazio = usa o da configuração geral" />
        <label className="flex items-start gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={f.wabaCoexistence} onChange={(e) => setF((s) => ({ ...s, wabaCoexistence: e.target.checked }))} className="mt-0.5" />
          <span><b>Coexistência</b>: o número continua no app WhatsApp Business do celular enquanto a API atende. O que for enviado pelo app aparece aqui (eco) como “Celular”.</span>
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={ocupado} onClick={salvar} className="text-xs font-medium bg-slate-800 text-white rounded-lg px-3 py-2 hover:bg-slate-700 disabled:opacity-50">Salvar dados</button>
        <button type="button" disabled={ocupado} onClick={verificar} className="text-xs font-medium border border-slate-300 rounded-lg px-3 py-2 text-slate-700 hover:bg-white disabled:opacity-50">Verificar conexão</button>
        <button type="button" disabled={ocupado} onClick={cadastroIntegrado} className="text-xs font-medium border border-emerald-400 text-emerald-700 rounded-lg px-3 py-2 hover:bg-emerald-50 disabled:opacity-50" title={info?.cadastroIntegradoPronto ? "Abre o cadastro da Meta" : "Configure App ID, App Secret e Config ID primeiro"}>
          {f.wabaCoexistence ? "Conectar pelo app WhatsApp Business (Meta)" : "Conectar pela Meta (Cadastro Integrado)"}
        </button>
      </div>
      {msg && <p className={`text-xs rounded-lg p-2 ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>{msg.ok ? "✓ " : "✗ "}{msg.texto}</p>}
      {info && (
        <p className="text-[11px] text-slate-500">
          Webhook: <code className="bg-white border border-slate-200 rounded px-1">{info.webhookUrl}</code> · token de verificação em “WABA — API oficial”.
        </p>
      )}
    </div>
  );
}
