import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(_req, { params }) {
  const { id } = await params;
  const cliques = await prisma.linkClique.findMany({
    where: { campanhaId: id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json(cliques);
}
