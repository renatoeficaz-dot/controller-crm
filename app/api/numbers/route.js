import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { lerCorpo, texto } from "@/lib/corpo";
import { wahaSessionSlug } from "@/lib/waha";

// Lista os números conectados (com o usuário atribuído). Todo mundo logado
// pode ler (seletor de número no Chat, na ficha do lead, etc.) — mas o
// registro inteiro incluía proxyUsername/proxyPassword em texto puro, e
// vendedor/cobrador conseguia ler a senha do proxy só chamando essa rota.
export async function GET() {
  const numbers = await prisma.whatsappNumber.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: { id: true, name: true } },
      agent: { select: { id: true, name: true } },
    },
  });
  const user = await getCurrentUser().catch(() => null);
  if (isAdmin(user)) return NextResponse.json(numbers);

  const seguro = numbers.map(({ proxyUsername, proxyPassword, ...n }) => n);
  return NextResponse.json(seguro);
}

// Conecta/cadastra um novo número
export async function POST(req) {
  const body = await lerCorpo(req);
  const label = texto(body.label);
  const number = texto(body.number);
  let instance = texto(body.instance);
  if (!label || !number || !instance) {
    return NextResponse.json({ error: "Preencha nome, número e instância." }, { status: 400 });
  }
  const provider = body.provider === "waha" ? "waha" : "evolution";
  // WAHA só aceita [a-zA-Z0-9_-] no nome da sessão — sem isso, "Cobrança SC"
  // (cedilha/espaço) salvava certinho aqui mas dava erro só depois, ao tentar
  // conectar de verdade.
  if (provider === "waha") instance = wahaSessionSlug(instance);
  const created = await prisma.whatsappNumber.create({
    data: { label, number, instance, provider, userId: body.userId || null },
    include: {
      user: { select: { id: true, name: true } },
      agent: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json(created);
}
