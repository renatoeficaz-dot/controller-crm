import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { relatorioIntegridade } from "@/lib/integridade";

// Item 242: painel de saúde do sistema — visão rápida de tudo que pode estar
// quebrado sem ninguém ter percebido ainda: número desconectado, mensagem
// falhando, dado inconsistente. Só admin.
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    numeros, falhas24h, integridade, totalContatos, totalMensagens, totalParcelasAbertas,
  ] = await Promise.all([
    prisma.whatsappNumber.findMany({ select: { id: true, label: true, ultimoEstado: true, desconectadoEm: true } }),
    prisma.message.count({ where: { fromMe: true, status: "falhou", createdAt: { gte: ontem } } }),
    relatorioIntegridade(),
    prisma.contact.count({ where: { excluidoEm: null } }),
    prisma.message.count(),
    prisma.parcela.count({ where: { paid: false, renegociada: false } }),
  ]);

  const numerosDesconectados = numeros.filter((n) => n.ultimoEstado && n.ultimoEstado !== "open");
  const alertasIntegridade = integridade.orfas.length + integridade.somaDivergente.length + integridade.semEspecie.length;

  return NextResponse.json({
    numeros: numeros.map((n) => ({ id: n.id, label: n.label, estado: n.ultimoEstado, desconectadoEm: n.desconectadoEm })),
    numerosDesconectados: numerosDesconectados.length,
    falhas24h,
    alertasIntegridade,
    totalContatos,
    totalMensagens,
    totalParcelasAbertas,
    tudoOk: numerosDesconectados.length === 0 && falhas24h === 0 && alertasIntegridade === 0,
  });
}
