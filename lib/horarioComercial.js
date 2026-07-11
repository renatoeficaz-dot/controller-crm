import { prisma } from "@/lib/prisma";

// Sem horário configurado = automação sempre ativa (comportamento antigo).
export async function dentroDoHorarioComercial() {
  const cfg = await prisma.config.findUnique({ where: { id: "singleton" } });
  if (!cfg?.horarioComercialInicio || !cfg?.horarioComercialFim) return true;

  const agora = new Date();
  const minutosAgora = agora.getHours() * 60 + agora.getMinutes();
  const [hi, mi] = cfg.horarioComercialInicio.split(":").map(Number);
  const [hf, mf] = cfg.horarioComercialFim.split(":").map(Number);
  const minutosIni = hi * 60 + (mi || 0);
  const minutosFim = hf * 60 + (mf || 0);
  return minutosAgora >= minutosIni && minutosAgora <= minutosFim;
}
