import { prisma } from "@/lib/prisma";

// Trava final: nenhuma mensagem de WhatsApp sai com chave Pix diferente da cadastrada em
// Configurações → Gestão. Cobre qualquer origem (régua de cobrança, mensagem pronta, IA, texto antigo
// guardado num número). Bloqueia (a) a chave antiga conhecida e (b) qualquer "Segue a chave Pix" cuja
// primeira linha não seja a chave atual.
const CHAVES_ANTIGAS = ["948528114"]; // dígitos da chave Pix que não pode mais ser enviada

let cache = { em: 0, chave: "" };
async function chaveAtual() {
  if (Date.now() - cache.em < 30000) return cache.chave;
  const cfg = await prisma.config.findUnique({ where: { id: "singleton" }, select: { pixChave: true } }).catch(() => null);
  cache = { em: Date.now(), chave: String(cfg?.pixChave || "").trim() };
  return cache.chave;
}

const soDigitos = (v) => String(v || "").replace(/\D/g, "");

export async function verificarTextoPix(texto) {
  const t = String(texto || "");
  if (!t) return { ok: true };
  const dig = soDigitos(t);
  for (const antiga of CHAVES_ANTIGAS) {
    if (dig.includes(antiga)) return { ok: false, motivo: "contém a chave Pix antiga (" + antiga + ")" };
  }
  if (/segue a chave pix/i.test(t)) {
    const chave = await chaveAtual();
    const primeira = t.split("\n")[0].trim();
    if (!chave || primeira !== chave) return { ok: false, motivo: "chave Pix da mensagem não confere com a cadastrada" };
  }
  return { ok: true };
}
