// IP real do cliente atrás do proxy (Traefik do Coolify): o ÚLTIMO item do x-forwarded-for é o que o nosso proxy escreveu; o primeiro
// é o que o cliente mandou e pode ser inventado (trocar o cabeçalho a cada requisição furava qualquer limite por IP).
export function ipDoCliente(req) {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const partes = xff.split(",").map((p) => p.trim()).filter(Boolean);
    if (partes.length) return partes[partes.length - 1];
  }
  return req.headers.get("x-real-ip") || "desconhecido";
}
