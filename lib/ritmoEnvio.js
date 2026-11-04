// Ritmo dos envios automáticos por número: as rotinas (lembrete, Pix...) rodam em paralelo e, se coincidem no mesmo minuto, o número
// manda várias mensagens quase juntas — padrão que ajuda a bloquear. Cada envio automático registra a hora; quem vai enviar espera
// até haver folga mínima desde o último envio automático do mesmo número (de qualquer rotina).
const ultimo = new Map();
export function marcarEnvio(instance) { ultimo.set(instance, Date.now()); }
export async function esperarFolga(instance, minMs) {
  const falta = (ultimo.get(instance) || 0) + minMs - Date.now();
  if (falta > 0) await new Promise((r) => setTimeout(r, falta));
}
