import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import UnitDetail from "@/components/UnitDetail";

export default async function UnitPage({ params }) {
  const { id } = await params;
  const unit = await prisma.unit.findUnique({ where: { id } });
  if (!unit) notFound();
  return <UnitDetail unit={unit} />;
}
