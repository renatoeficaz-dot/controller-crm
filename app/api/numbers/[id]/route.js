import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { lerCorpo, ehNaoEncontrado, respostaNaoEncontrado, texto } from "@/lib/corpo";

// Edita um número (ex.: reatribuir usuário, mudar instância)
export async function PATCH(req, { params }) {
  try {
    const { id } = await params;
    const body = await lerCorpo(req);
    const data = {};
    for (const f of ["label", "number", "instance"]) {
      if (f in body) data[f] = texto(body[f]);
    }
    if ("userId" in body) data.userId = body.userId || null;
    if ("agentId" in body) data.agentId = body.agentId || null;
    if ("provider" in body) data.provider = body.provider === "waha" ? "waha" : "evolution";
    if ("estadosCobranca" in body) data.estadosCobranca = texto(body.estadosCobranca) || null;
    if ("mensagemCobranca" in body) data.mensagemCobranca = texto(body.mensagemCobranca) || null;
    if ("aquecimentoAtivo" in body) {
      data.aquecimentoAtivo = !!body.aquecimentoAtivo;
      // Liga o cronômetro no momento em que o aquecimento é ativado — sem data,
      // não dá pra saber em que degrau da escada o número está.
      if (body.aquecimentoAtivo) data.aquecimentoDesde = new Date();
    }
    if ("limiteEnviosHora" in body) data.limiteEnviosHora = body.limiteEnviosHora === "" || body.limiteEnviosHora == null ? null : Number(body.limiteEnviosHora) || null;
    if ("proxyServer" in body) data.proxyServer = texto(body.proxyServer) || null;
    if ("proxyUsername" in body) data.proxyUsername = texto(body.proxyUsername) || null;
    if ("proxyPassword" in body) data.proxyPassword = texto(body.proxyPassword) || null;
  
    // Só um número pode ser "padrão" por vez — desmarca os outros antes.
    if (body.padrao === true) {
      await prisma.whatsappNumber.updateMany({ where: { padrao: true }, data: { padrao: false } });
      data.padrao = true;
    } else if (body.padrao === false) {
      data.padrao = false;
    }
  
    const updated = await prisma.whatsappNumber.update({
      where: { id },
      data,
      include: {
        user: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json(updated);
  } catch (err) {
    // Registro do `where` não existe (link velho, dois cliques, id
    // chutado): é "não achei", não erro de servidor.
    if (ehNaoEncontrado(err)) return respostaNaoEncontrado();
    throw err;
  }
}

// Remove um número
export async function DELETE(_req, { params }) {
  try {
    const { id } = await params;
    await prisma.whatsappNumber.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Registro do `where` não existe (link velho, dois cliques, id
    // chutado): é "não achei", não erro de servidor.
    if (ehNaoEncontrado(err)) return respostaNaoEncontrado();
    throw err;
  }
}
