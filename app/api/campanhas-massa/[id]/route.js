import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { whereDoFiltro } from "@/lib/campanhaMassa";

export async function PATCH(req, { params }) {
  const { id } = await params;
  const { status } = await req.json().catch(() => ({}));
  if (!["enviando", "cancelada"].includes(status)) {
    return NextResponse.json({ error: "Status inválido." }, { status: 400 });
  }
  const data = { status };
  if (status === "enviando") {
    data.iniciadoEm = new Date();
    // CONGELA o público agora. O envio acontece em lotes a cada 5 min e
    // paginava com `skip: enviados`, sobre uma consulta refeita a cada lote —
    // como o funil muda sozinho o tempo todo (o webhook move lead de etapa
    // quando o cliente responde), a lista mudava entre um lote e outro:
    // quem saía do filtro empurrava a janela e fazia PULAR gente, quem entrava
    // fazia alguém receber a MESMA mensagem duas vezes. Com a lista fixa de
    // ids, o `skip` passa a andar sobre um conjunto estável.
    const campanhaAtual = await prisma.campanhaMassa.findUnique({ where: { id } });
    if (campanhaAtual) {
      const filtros = JSON.parse(campanhaAtual.filtros || "{}");
      if (!filtros.ids?.length) {
        const alvos = await prisma.contact.findMany({
          where: whereDoFiltro(filtros),
          orderBy: { id: "asc" },
          select: { id: true },
        });
        data.filtros = JSON.stringify({ ...filtros, ids: alvos.map((c) => c.id) });
        data.totalAlvos = alvos.length;
      }
    }
  }
  const campanha = await prisma.campanhaMassa.update({ where: { id }, data });
  return NextResponse.json(campanha);
}

export async function DELETE(_req, { params }) {
  const { id } = await params;
  await prisma.campanhaMassa.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
