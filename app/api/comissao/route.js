import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { resumoComissao } from "@/lib/comissao";

// Resumo de comissão. Sem ?nome, é o do próprio usuário logado (é o painel que
// o cobrador vê). Com ?nome, só admin pode consultar de outra pessoa.
export async function GET(req) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const pedido = new URL(req.url).searchParams.get("nome");
  if (pedido && pedido !== user.name && !isAdmin(user)) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const resumo = await resumoComissao(pedido || user.name);
  return NextResponse.json({ nome: pedido || user.name, ...resumo });
}

// Configuração de comissão (metas e bônus) — só admin.
export async function PATCH(req) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const num = (v) => (v === "" || v == null ? 0 : Number(v) || 0);
  const data = {
    metaDiariaValor: num(body.metaDiariaValor),
    bonusDiario: num(body.bonusDiario),
    metaSemanalValor: num(body.metaSemanalValor),
    bonusSemanal: num(body.bonusSemanal),
  };
  if ("progressivaAtiva" in body) data.progressivaAtiva = !!body.progressivaAtiva;
  if ("descontoPorPerdaValor" in body) data.descontoPorPerdaValor = num(body.descontoPorPerdaValor);

  const cfg = await prisma.comissaoConfig.upsert({
    where: { id: "singleton" },
    update: data,
    create: { id: "singleton", ...data },
  });
  return NextResponse.json(cfg);
}
