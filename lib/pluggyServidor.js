// Pluggy (Open Finance): conecta a conta do banco e traz as transações direto para a Conciliação, sem precisar baixar OFX.
// As transações viram ExtratoMovimento (chave "pluggy|<id>") e passam pela MESMA conciliação do OFX (lib/conciliacaoServidor.js).
// O Client Secret fica criptografado no banco e nunca aparece em log, resposta ou auditoria.
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { decifrar } from "@/lib/segredo";
import { movimentoDaPluggy, mesmoMovimento, diaBRT } from "@/lib/conciliacaoOfx";
import { rodarConciliacao, INICIO_CONCILIACAO } from "@/lib/conciliacaoServidor";

const API = "https://api.pluggy.ai";
const DIA = 86400e3;
let chaveCache = { valor: null, expira: 0, clientId: null };

async function credenciais() {
  const c = await prisma.config.findUnique({ where: { id: "singleton" }, select: { pluggyClientId: true, pluggySecretEnc: true } });
  const secret = decifrar(c?.pluggySecretEnc);
  if (!c?.pluggyClientId || !secret) throw new Error("Pluggy não configurada: preencha Client ID e Client Secret em Configurações › Conta bancária.");
  return { clientId: c.pluggyClientId, clientSecret: secret };
}

export function limparCachePluggy() {
  chaveCache = { valor: null, expira: 0, clientId: null };
}

// API key dura 2 h; renova com folga de 10 min.
async function apiKey() {
  if (chaveCache.valor && Date.now() < chaveCache.expira) return chaveCache.valor;
  const cred = await credenciais();
  const r = await fetch(`${API}/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cred), signal: AbortSignal.timeout(20000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.apiKey) throw new Error(r.status === 401 || r.status === 403 ? "Pluggy recusou o Client ID/Secret." : `Pluggy auth ${r.status}`);
  chaveCache = { valor: j.apiKey, expira: Date.now() + 110 * 60e3, clientId: cred.clientId };
  return j.apiKey;
}

async function api(caminho, { method = "GET", body } = {}) {
  const r = await fetch(`${API}${caminho}`, {
    method,
    headers: { "X-API-KEY": await apiKey(), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Pluggy ${method} ${caminho.split("?")[0]} ${r.status}: ${String(j?.message || "erro").slice(0, 160)}`);
  return j;
}

// Testa as credenciais salvas (sem devolver nada sensível).
export async function testarCredenciais() {
  limparCachePluggy();
  await apiKey();
  return true;
}

export async function webhookUrl(origem) {
  const c = await prisma.config.findUnique({ where: { id: "singleton" }, select: { pluggyWebhookToken: true } });
  let token = c?.pluggyWebhookToken;
  if (!token) {
    token = crypto.randomBytes(24).toString("hex");
    await prisma.config.update({ where: { id: "singleton" }, data: { pluggyWebhookToken: token } });
  }
  const base = (process.env.APP_URL || origem || "").replace(/\/$/, "");
  return base.startsWith("https://") ? `${base}/api/webhook/pluggy?t=${token}` : null;
}

// Token de 30 min para abrir o widget "Conectar conta" (itemId = reconectar uma conexão que pediu login de novo).
export async function criarConnectToken({ itemId, origem, usuario }) {
  const url = await webhookUrl(origem);
  const options = { clientUserId: `controller:${usuario || "admin"}`, ...(url ? { webhookUrl: url } : {}) };
  const j = await api("/connect_token", { method: "POST", body: { ...(itemId ? { itemId } : {}), options } });
  return j.accessToken;
}

// Depois do widget: grava as contas correntes do item e liga cada uma à conta (Banco) do sistema.
export async function registrarItem(itemId, bancoId) {
  const item = await api(`/items/${encodeURIComponent(itemId)}`);
  const contas = await api(`/accounts?itemId=${encodeURIComponent(itemId)}&type=BANK`);
  const salvas = [];
  for (const a of contas.results || []) {
    const nome = [item?.connector?.name, a.marketingName || a.name].filter(Boolean).join(" — ").slice(0, 120);
    const c = await prisma.pluggyConta.upsert({
      where: { accountId: a.id },
      update: { itemId, nome, numero: a.number || null, saldo: a.balance ?? null, ativo: true, ...(bancoId ? { bancoId } : {}) },
      create: { itemId, accountId: a.id, nome, numero: a.number || null, saldo: a.balance ?? null, bancoId: bancoId || null },
    });
    salvas.push(c);
  }
  return { contas: salvas, statusItem: item?.status || null };
}

// Pede ao banco uma atualização do item (a Pluggy sozinha só atualiza 1x por dia). No máximo 1x por hora, das 7h às 23h.
async function talvezAtualizarItem(conta, forcar) {
  const hora = Number(new Date().toLocaleString("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" }));
  if (!forcar && (hora < 7 || hora >= 23)) return;
  if (!forcar && conta.ultimoRefresh && Date.now() - conta.ultimoRefresh.getTime() < 60 * 60e3) return;
  await prisma.pluggyConta.updateMany({ where: { itemId: conta.itemId }, data: { ultimoRefresh: new Date() } });
  await api(`/items/${encodeURIComponent(conta.itemId)}`, { method: "PATCH", body: {} }).catch((e) => console.error("[pluggy] atualizar item:", e.message));
}

async function transacoes(accountId, dateFrom) {
  const todas = [];
  let qs = `accountId=${encodeURIComponent(accountId)}&dateFrom=${dateFrom}`;
  for (let i = 0; i < 50 && qs; i++) {
    const j = await api(`/v2/transactions?${qs}`);
    todas.push(...(j.results || []));
    qs = j.next ? String(j.next).replace(/^\?/, "") : null;
  }
  return todas;
}

// Traz as transações da conta para o extrato e concilia. Devolve { novos, repetidos, casados }.
export async function sincronizarConta(conta, { forcarAtualizacao = false } = {}) {
  if (!conta.bancoId) throw new Error("Escolha em qual conta do sistema esses lançamentos são conferidos.");
  await talvezAtualizarItem(conta, forcarAtualizacao);
  // Janela: desde a última sincronização (com 3 dias de folga: o banco às vezes publica atrasado), nunca antes do início da conciliação.
  const desdeMs = Math.max(new Date(`${INICIO_CONCILIACAO}T00:00:00-03:00`).getTime(), (conta.ultimaSync?.getTime() || Date.now() - 7 * DIA) - 3 * DIA);
  const dateFrom = diaBRT(new Date(desdeMs));
  const txs = (await transacoes(conta.accountId, dateFrom)).filter((t) => !t.status || t.status === "POSTED");
  const movs = txs.map(movimentoDaPluggy).filter(Boolean);
  let novos = 0, repetidos = 0;
  if (movs.length) {
    const tempos = movs.map((m) => m.data.getTime());
    const existentes = await prisma.extratoMovimento.findMany({
      where: { bancoId: conta.bancoId, data: { gte: new Date(Math.min(...tempos) - DIA), lte: new Date(Math.max(...tempos) + DIA) } },
      select: { chave: true, data: true, valor: true, tipo: true, descricao: true },
    });
    const chaves = new Set(existentes.map((e) => e.chave));
    // Só compara com o que veio por OUTRO caminho (OFX): duas transações iguais da própria Pluggy são dois Pix de verdade.
    const doOfx = existentes.filter((e) => !e.chave.startsWith("pluggy|"));
    const usados = new Set();
    const gravar = [];
    for (const m of movs) {
      if (chaves.has(m.chave)) { repetidos++; continue; }
      const igual = doOfx.find((e) => !usados.has(e.chave) && mesmoMovimento(m, e));
      if (igual) { usados.add(igual.chave); repetidos++; continue; }
      gravar.push(m);
    }
    if (gravar.length) {
      // Uma "importação" por conta e por dia: é ela que diz à Conciliação quais dias estão cobertos pelo extrato.
      const dia = diaBRT(new Date());
      const rotulo = `Pluggy ${conta.nome || conta.accountId} ${dia}`.slice(0, 190);
      let imp = await prisma.extratoImportacao.findFirst({ where: { bancoId: conta.bancoId, arquivo: rotulo } });
      if (!imp) imp = await prisma.extratoImportacao.create({ data: { bancoId: conta.bancoId, arquivo: rotulo, de: new Date(`${dateFrom}T00:00:00-03:00`), ate: new Date(), qtdMov: 0, novos: 0, importadoPor: "Pluggy" } });
      await prisma.extratoMovimento.createMany({ data: gravar.map((m) => ({ ...m, bancoId: conta.bancoId, importacaoId: imp.id })) });
      novos = gravar.length;
    }
  }
  // Período coberto e saldo: atualiza a importação do dia mesmo sem movimento novo (o dia passa a contar como conferido).
  const contaApi = await api(`/accounts/${encodeURIComponent(conta.accountId)}`).catch(() => null);
  const saldo = contaApi?.balance ?? null;
  const dia = diaBRT(new Date());
  const rotulo = `Pluggy ${conta.nome || conta.accountId} ${dia}`.slice(0, 190);
  const imp = await prisma.extratoImportacao.findFirst({ where: { bancoId: conta.bancoId, arquivo: rotulo } });
  const dados = { ate: new Date(), saldoFinal: saldo, saldoData: saldo != null ? new Date() : null, qtdMov: movs.length };
  if (imp) await prisma.extratoImportacao.update({ where: { id: imp.id }, data: { ...dados, novos: imp.novos + novos } });
  else await prisma.extratoImportacao.create({ data: { bancoId: conta.bancoId, arquivo: rotulo, de: new Date(`${dateFrom}T00:00:00-03:00`), importadoPor: "Pluggy", novos, ...dados } });
  const conc = await rodarConciliacao(conta.bancoId);
  await prisma.pluggyConta.update({ where: { id: conta.id }, data: { ultimaSync: new Date(), ultimoErro: null, ...(saldo != null ? { saldo } : {}) } });
  return { novos, repetidos, ...conc };
}

let rodando = false;
// Todas as contas ativas, uma de cada vez. Nunca lança (rodada automática e webhook).
export async function sincronizarPluggy({ forcarAtualizacao = false } = {}) {
  if (rodando) return { ocupado: true };
  rodando = true;
  const resultado = [];
  try {
    const cfg = await prisma.config.findUnique({ where: { id: "singleton" }, select: { pluggyClientId: true, pluggySecretEnc: true } });
    if (!cfg?.pluggyClientId || !cfg?.pluggySecretEnc) return { semConfig: true };
    const contas = await prisma.pluggyConta.findMany({ where: { ativo: true, bancoId: { not: null } } });
    for (const c of contas) {
      try {
        resultado.push({ conta: c.nome, ...(await sincronizarConta(c, { forcarAtualizacao })) });
      } catch (e) {
        console.error("[pluggy] sincronizar", c.nome, e.message);
        await prisma.pluggyConta.update({ where: { id: c.id }, data: { ultimoErro: String(e.message).slice(0, 300) } }).catch(() => {});
        resultado.push({ conta: c.nome, erro: e.message });
      }
    }
    return { contas: resultado };
  } finally {
    rodando = false;
  }
}

// Confere se o webhook é nosso (token na URL + clientId do payload).
export async function webhookValido(token, payload) {
  const c = await prisma.config.findUnique({ where: { id: "singleton" }, select: { pluggyWebhookToken: true, pluggyClientId: true } });
  if (!c?.pluggyWebhookToken || !token) return false;
  const a = Buffer.from(String(token)), b = Buffer.from(c.pluggyWebhookToken);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  return !payload?.clientId || payload.clientId === c.pluggyClientId;
}
