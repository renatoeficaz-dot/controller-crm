// Geolocalização por IP, best-effort — usa a API gratuita do ip-api.com (sem
// chave, ~45 req/min). Nunca deve travar o redirecionamento do link: timeout
// curto e falha silenciosa (retorna null) se o serviço estiver fora do ar.
export async function geoFromIp(ip) {
  if (!ip) return null;
  const privado = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$)/.test(ip);
  if (privado) return null;
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,city,regionName,countryCode`, {
      signal: AbortSignal.timeout(3000),
    });
    const data = await res.json().catch(() => null);
    if (!data || data.status !== "success") return null;
    const partes = [data.city, data.regionName].filter(Boolean);
    return partes.length ? partes.join(" - ") : data.countryCode || null;
  } catch {
    return null;
  }
}
