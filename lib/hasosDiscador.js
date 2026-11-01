// Discadores (headless) da Hasos no navegador: um por número conectado. Compartilhado pelo botão "Ligar" (LigarHasos)
// e pelo receptor global de chamadas (ChamadasHasos). Os eventos do discador viram "hasos:ev" na window.
const EMBED = "https://phone.hasos.com.br/embed.js";
const discadores = {}; // instanceId -> HasosPhone
let carregandoEmbed = null;

export function carregarEmbed() {
  if (typeof window === "undefined") return Promise.reject(new Error("sem janela"));
  if (window.HasosPhone) return Promise.resolve();
  if (!carregandoEmbed) {
    carregandoEmbed = new Promise((ok, erro) => {
      const s = document.createElement("script");
      s.src = EMBED;
      s.onload = () => (window.HasosPhone ? ok() : erro(new Error("embed.js carregou sem HasosPhone")));
      s.onerror = () => { carregandoEmbed = null; erro(new Error("Não foi possível carregar o discador da Hasos.")); };
      document.head.appendChild(s);
    });
  }
  return carregandoEmbed;
}

const EVENTOS = ["call:started", "call:accepted", "call:ended", "offer:received"];

export async function obterDiscador(inst) {
  if (discadores[inst.id]) return discadores[inst.id];
  const t = await fetch("/api/hasos/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instanceId: inst.id }) }).then((x) => x.json());
  if (!t?.token) throw new Error(t?.error || "Não consegui o token do discador.");
  await carregarEmbed();
  if (discadores[inst.id]) return discadores[inst.id]; // outro chamador criou enquanto esperava
  const d = window.HasosPhone.create({ token: t.token, allowedOrigin: window.location.origin });
  await d.ready();
  for (const ev of EVENTOS) d.on?.(ev, (payload) => window.dispatchEvent(new CustomEvent("hasos:ev", { detail: { ev, payload, instId: inst.id } })));
  discadores[inst.id] = d;
  return d;
}

export const esquecerDiscador = (id) => { delete discadores[id]; };
export const discadorDe = (id) => discadores[id] || null;
