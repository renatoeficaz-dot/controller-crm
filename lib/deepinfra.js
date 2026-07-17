// Consulta o saldo da conta DeepInfra (usada pra texto/transcrição/voz da IA).
// Endpoint não documentado publicamente — descoberto via o openapi.json deles
// (https://api.deepinfra.com/openapi.json, tag "Billing").
async function fetchWithTimeout(url, options, ms = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// stripe_balance: negativo = crédito disponível pra gastar; positivo = dívida.
// saldo (o que ainda dá pra usar) = -stripe_balance, nunca menor que 0.
export async function getDeepInfraSaldo(apiKey) {
  if (!apiKey) return { ok: false, error: "Sem API Key da DeepInfra configurada." };
  try {
    const res = await fetchWithTimeout("https://api.deepinfra.com/payment/checklist?compute_owed=true", {
      headers: { Authorization: `bearer ${apiKey}` },
    });
    if (res.status === 401 || res.status === 403) return { ok: false, error: "API Key da DeepInfra inválida." };
    if (!res.ok) return { ok: false, error: `DeepInfra respondeu ${res.status}.` };
    const data = await res.json().catch(() => null);
    if (!data) return { ok: false, error: "Resposta inválida da DeepInfra." };
    const saldo = Math.max(0, -(data.stripe_balance ?? 0));
    return { ok: true, saldo, usoRecente: data.recent ?? 0 };
  } catch (err) {
    return { ok: false, error: err.name === "AbortError" ? "DeepInfra demorou demais para responder." : err.message };
  }
}
