import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(req) {
  const { match, tagId } = await req.json().catch(() => ({}));
  if (!(match || "").trim() || !tagId) {
    return NextResponse.json({ error: "Preencha o texto e escolha a tag." }, { status: 400 });
  }
  const rule = await prisma.autoTagRule.create({ data: { match: match.trim(), tagId } });
  return NextResponse.json(rule);
}
