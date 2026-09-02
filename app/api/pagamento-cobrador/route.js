import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { lerCorpo, texto } from "@/lib/corpo";
import { calcularPagamentoSemana } from "@/lib/pagamentoCobrador";

const num = (v) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

// Config de acerto de um cobrador + prévia da semana corrente.
// `userId` na query; sem ele, devolve todas as configs (tela de gestão).
export async function GET(req) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) {
    // Sem admin, cada um só enxerga o próprio acerto — o do colega é salário.
    const where = isAdmin(user) ? {} : { userId: user.id };
    const configs = await prisma.pagamentoCobradorConfig.findMany({
      where,
      include: { user: { select: { id: true, name: true } } },
    });
    return NextResponse.json(configs);
  }
  if (userId !== user.id && !isAdmin(user)) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }
  const [config, previa] = await Promise.all([
    prisma.pagamentoCobradorConfig.findUnique({ where: { userId } }),
    calcularPagamentoSemana(userId),
  ]);
  return NextResponse.json({ config, previa });
}

// Cria/atualiza a config. Só admin: é dinheiro de salário.
export async function PUT(req) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "Só admin." }, { status: 403 });

  const body = await lerCorpo(req);
  const userId = texto(body.userId);
  if (!userId) return NextResponse.json({ error: "Escolha o colaborador." }, { status: 400 });
  const alvo = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!alvo) return NextResponse.json({ error: "Colaborador não encontrado." }, { status: 404 });

  const dados = {
    fixoSemanal: num(body.fixoSemanal),
    bonusMinima: num(body.bonusMinima),
    bonusMedia: num(body.bonusMedia),
    bonusMaxima: num(body.bonusMaxima),
    ativo: body.ativo !== false,
  };
  const config = await prisma.pagamentoCobradorConfig.upsert({
    where: { userId },
    create: { userId, ...dados },
    update: dados,
  });
  return NextResponse.json(config);
}
