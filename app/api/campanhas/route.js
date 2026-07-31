import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Gera um slug legível a partir do nome, com sufixo aleatório pra garantir
// unicidade sem precisar o usuário escolher (ex.: "Instagram SP" -> "instagram-sp-a1b2").
function gerarSlug(nome) {
  const base = (nome || "campanha")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // remove acentos
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "campanha";
  const sufixo = Math.random().toString(36).slice(2, 6);
  return `${base}-${sufixo}`;
}

export async function GET() {
  const campanhas = await prisma.linkCampanha.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      numero: { select: { id: true, label: true, number: true } },
      _count: { select: { leads: true } },
    },
  });
  return NextResponse.json(campanhas);
}

export async function POST(req) {
  const body = await req.json();
  if (!body.nome?.trim()) return NextResponse.json({ error: "Nome é obrigatório." }, { status: 400 });
  if (!body.numeroId) return NextResponse.json({ error: "Escolha o número de destino." }, { status: 400 });

  let slug = gerarSlug(body.nome);
  // Colisão é raríssima (sufixo aleatório), mas garante unicidade mesmo assim.
  for (let tentativas = 0; tentativas < 5; tentativas++) {
    const existe = await prisma.linkCampanha.findUnique({ where: { slug } });
    if (!existe) break;
    slug = gerarSlug(body.nome);
  }

  const campanha = await prisma.linkCampanha.create({
    data: {
      nome: body.nome.trim(),
      slug,
      numeroId: body.numeroId,
      regiao: body.regiao?.trim() || null,
      utmSource: body.utmSource?.trim() || null,
      utmMedium: body.utmMedium?.trim() || null,
      utmCampaign: body.utmCampaign?.trim() || null,
      mensagem: body.mensagem?.trim() || null,
      modoColeta: ["chat", "formulario", "perguntar"].includes(body.modoColeta) ? body.modoColeta : "chat",
      formCampos: Array.isArray(body.formCampos) && body.formCampos.length ? JSON.stringify(body.formCampos) : null,
    },
    include: {
      numero: { select: { id: true, label: true, number: true } },
      _count: { select: { leads: true } },
    },
  });
  return NextResponse.json(campanha);
}
