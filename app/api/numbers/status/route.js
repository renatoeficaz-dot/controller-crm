import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { instanceState } from "@/lib/evolution";
import { sessionStateWaha } from "@/lib/waha";

// Estado de conexão de TODOS os números — usado pelo aviso fixo no rodapé
// (ConnectionStatusBanner) e pela lista em Configurações → Números.
// Detecta transições de estado (conectou/caiu) e grava timestamp + log de
// histórico — é o único lugar que escreve esses dados, pra não duplicar.
export async function GET() {
  const cfg = await prisma.config.findUnique({ where: { id: "singleton" } });
  const base = cfg?.evolutionUrl || process.env.EVOLUTION_API_URL || "";
  const apikey = cfg?.evolutionApiKey || process.env.EVOLUTION_API_KEY || "";
  const wahaBase = cfg?.wahaUrl || "";
  const wahaApikey = cfg?.wahaApiKey || "";

  const numeros = await prisma.whatsappNumber.findMany({
    select: { id: true, label: true, number: true, instance: true, ultimoEstado: true, provider: true },
  });

  const status = await Promise.all(
    numeros.map(async (n) => {
      const state = n.provider === "waha"
        ? await sessionStateWaha(wahaBase, wahaApikey, n.instance)
        : await instanceState(base, apikey, n.instance);
      if (state !== "unknown" && state !== n.ultimoEstado) {
        const conectou = state === "open";
        await prisma.whatsappNumber.update({
          where: { id: n.id },
          data: {
            ultimoEstado: state,
            ...(conectou ? { conectadoEm: new Date() } : { desconectadoEm: new Date() }),
          },
        }).catch(() => {});
        // Só loga transições reais (ignora a primeira leitura, quando ultimoEstado ainda é null)
        if (n.ultimoEstado !== null) {
          await prisma.conexaoLog.create({
            data: { numeroId: n.id, evento: conectou ? "conectado" : "desconectado" },
          }).catch(() => {});
        }
      }
      return { id: n.id, label: n.label, number: n.number, state };
    })
  );

  return NextResponse.json(status);
}
