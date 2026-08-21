import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { lerCorpo, texto, nomeMuitoLongo } from "@/lib/corpo";

// Links úteis (atalhos) que a equipe usa no dia a dia — configurável em
// Configurações > Links úteis.
export async function GET() {
  const lista = await prisma.linkUtil.findMany({ orderBy: [{ ordem: "asc" }, { createdAt: "asc" }] });
  return NextResponse.json(lista);
}

export async function POST(req) {
  const body = await lerCorpo(req);
  const titulo = texto(body.titulo);
  let url = texto(body.url);
  if (!titulo || !url) {
    return NextResponse.json({ error: "Informe título e link." }, { status: 400 });
  }
  if (nomeMuitoLongo(titulo) || url.length > 2000) {
    return NextResponse.json({ error: "Título ou link muito longo." }, { status: 400 });
  }
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  const ultimo = await prisma.linkUtil.findFirst({ orderBy: { ordem: "desc" } });
  const criado = await prisma.linkUtil.create({
    data: { titulo, url, ordem: (ultimo?.ordem ?? -1) + 1 },
  });
  return NextResponse.json(criado);
}
