import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { lerCorpo, texto } from "@/lib/corpo";

// Tela de entrada disfarçada de calculadora.
//
// É DISFARCE, não segurança: quem protege os dados continua sendo o login.
// Isso só evita que a tela se anuncie como CRM pra quem olha o celular de
// lado. Por isso o código não precisa de bcrypt — mas também não vai no
// bundle do navegador, senão bastaria ler o JS da página pra achar.

// Rota pública de propósito: é a porta de entrada, ninguém está logado ainda.
export async function GET() {
  const cfg = await prisma.config.findUnique({
    where: { id: "singleton" },
    select: { codigoCalculadora: true },
  });
  // Devolve só se ESTÁ ligado — nunca o código em si.
  return NextResponse.json({ ativo: !!cfg?.codigoCalculadora });
}

export async function POST(req) {
  const cfg = await prisma.config.findUnique({
    where: { id: "singleton" },
    select: { codigoCalculadora: true },
  });
  // Desligado: qualquer coisa abre, senão o disfarce trancaria a porta sem
  // que ninguém tenha configurado nada.
  if (!cfg?.codigoCalculadora) return NextResponse.json({ ok: true });

  const codigo = texto((await lerCorpo(req)).codigo);
  const ok = codigo === cfg.codigoCalculadora;
  // Atraso fixo no erro: sem ele, dava pra medir o tempo de resposta e
  // descobrir o tamanho do código. É barato e não atrapalha quem acerta.
  if (!ok) await new Promise((r) => setTimeout(r, 400));
  return NextResponse.json({ ok });
}
