import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { lerCorpo, texto } from "@/lib/corpo";

export async function POST(req) {
  const { match, tagId } = await lerCorpo(req);
  if (!texto(match) || !tagId) {
    return NextResponse.json({ error: "Preencha o texto e escolha a tag." }, { status: 400 });
  }
  const rule = await prisma.autoTagRule.create({ data: { match: match.trim(), tagId } });
  return NextResponse.json(rule);
}
