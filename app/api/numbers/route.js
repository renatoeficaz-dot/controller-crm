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
  const semToken = numbers.map((n) => ({ ...n, wabaAccessToken: n.wabaAccessToken ? "***" : null }));
  if (isAdmin(user)) return NextResponse.json(semToken);

  const seguro = semToken.map(({ proxyUsername, proxyPassword, ...n }) => n);
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
  const provider = body.provider === "waha" ? "waha" : body.provider === "waba" ? "waba" : "evolution";
  // WAHA só aceita [a-zA-Z0-9_-] no nome da sessão — sem isso, "Cobrança SC"
  // (cedilha/espaço) salvava certinho aqui mas dava erro só depois, ao tentar
  // conectar de verdade.
  if (provider === "waha") instance = wahaSessionSlug(instance);
  // Mesma instância em dois cadastros: as mensagens chegavam e saíam pelo número errado (o sistema acha o número pela instância).
  if (await prisma.whatsappNumber.findFirst({ where: { instance }, select: { id: true } })) {
    return NextResponse.json({ error: "Já existe um número com essa instância." }, { status: 409 });
  }
  // Usuário que não existe dava erro de chave (500).
  if (body.userId && !(await prisma.user.findUnique({ where: { id: String(body.userId) }, select: { id: true } }))) {
    return NextResponse.json({ error: "Usuário não encontrado." }, { status: 400 });
  }
  const created = await prisma.whatsappNumber.create({
    data: {
      // Número só com dígitos: com espaço/traço/parênteses ele não casava com o telefone das conversas.
      label, number: number.replace(/\D/g, "") || number, instance, provider, userId: body.userId ? String(body.userId) : null,
      ...(provider === "waba"
        ? {
            wabaPhoneNumberId: texto(body.wabaPhoneNumberId).replace(/\D/g, "") || null,
            wabaBusinessAccountId: texto(body.wabaBusinessAccountId).replace(/\D/g, "") || null,
            wabaAccessToken: texto(body.wabaAccessToken).trim() || null,
            wabaCoexistence: !!body.wabaCoexistence,
          }
        : {}),
    },
    include: {
      user: { select: { id: true, name: true } },
      agent: { select: { id: true, name: true } },
    },
  });
  // Token da API oficial não volta em texto puro (igual à lista).
  return NextResponse.json({ ...created, wabaAccessToken: created.wabaAccessToken ? "***" : null });
}
