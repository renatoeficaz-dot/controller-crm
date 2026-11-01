import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { lerCorpo, texto } from "@/lib/corpo";
import { calcularComissaoMetas } from "@/lib/comissaoMetas";

const num = (v, padrao) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : padrao;
};

// Comissão por metas. Sem `userId`: a pessoa logada vê a própria (se tiver) e o admin vê a de todo mundo que tem comissão ativa.
// Com `userId` (admin, tela de gestão): devolve a config + a prévia da semana.
export async function GET(req) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const userId = new URL(req.url).searchParams.get("userId");
  if (userId) {
    if (userId !== user.id && !isAdmin(user)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    const [config, previa] = await Promise.all([
      prisma.comissaoMetasConfig.findUnique({ where: { userId } }),
      calcularComissaoMetas(userId),
    ]);
    return NextResponse.json({ config, previa });
  }

  const configs = await prisma.comissaoMetasConfig.findMany({
    where: { ativo: true, ...(isAdmin(user) ? {} : { userId: user.id }) },
    select: { userId: true },
  });
  const lista = (await Promise.all(configs.map((c) => calcularComissaoMetas(c.userId)))).filter(Boolean);
  // Quem vê só a própria fica na frente; para o admin, a dele (se houver) primeiro.
  lista.sort((a, b) => (a.userId === user.id ? -1 : b.userId === user.id ? 1 : a.nome.localeCompare(b.nome)));
  return NextResponse.json(lista);
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
  const desde = texto(body.desde);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde)) return NextResponse.json({ error: "Informe a data de início (a partir de quando vale)." }, { status: 400 });

  const dados = {
    desde: new Date(desde + "T00:00:00.000Z"),
    pctMinima: num(body.pctMinima, 1),
    pctMedia: num(body.pctMedia, 2),
    pctMaxima: num(body.pctMaxima, 3),
    ativo: body.ativo !== false,
  };
  const config = await prisma.comissaoMetasConfig.upsert({ where: { userId }, create: { userId, ...dados }, update: dados });
  return NextResponse.json(config);
}
