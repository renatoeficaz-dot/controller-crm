import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { lerCorpo, ehNaoEncontrado, respostaNaoEncontrado, texto } from "@/lib/corpo";
import { wahaSessionSlug } from "@/lib/waha";

// Edita um número (ex.: reatribuir usuário, mudar instância)
export async function PATCH(req, { params }) {
  try {
    const { id } = await params;
    const body = await lerCorpo(req);
    const data = {};
    for (const f of ["label", "number", "instance"]) {
      if (f in body) {
        data[f] = texto(body[f]);
        // Em branco deixava o número sem instância (nada mais saía por ele) ou sem nome no seletor.
        if (!data[f]) return NextResponse.json({ error: "Nome, número e instância não podem ficar vazios." }, { status: 400 });
      }
    }
    if (data.number) data.number = data.number.replace(/\D/g, "") || data.number;
    if (data.instance) {
      const outro = await prisma.whatsappNumber.findFirst({ where: { instance: data.instance, NOT: { id } }, select: { id: true } });
      if (outro) return NextResponse.json({ error: "Já existe outro número com essa instância." }, { status: 409 });
    }
    // Usuário/agente de IA que não existe dava erro de chave (500).
    if ("userId" in body) {
      if (body.userId && !(await prisma.user.findUnique({ where: { id: String(body.userId) }, select: { id: true } }))) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 400 });
      data.userId = body.userId ? String(body.userId) : null;
    }
    if ("agentId" in body) {
      if (body.agentId && !(await prisma.iaAgent.findUnique({ where: { id: String(body.agentId) }, select: { id: true } }).catch(() => ({ id: 1 })))) return NextResponse.json({ error: "Agente de IA não encontrado." }, { status: 400 });
      data.agentId = body.agentId ? String(body.agentId) : null;
    }
    if ("provider" in body) data.provider = body.provider === "waha" ? "waha" : body.provider === "waba" ? "waba" : "evolution";
    // WABA (API oficial da Meta): credenciais do número. O token só muda se vier um valor novo (nunca o "***" da listagem).
    if ("wabaPhoneNumberId" in body) data.wabaPhoneNumberId = texto(body.wabaPhoneNumberId).replace(/\D/g, "") || null;
    if ("wabaBusinessAccountId" in body) data.wabaBusinessAccountId = texto(body.wabaBusinessAccountId).replace(/\D/g, "") || null;
    if ("wabaAccessToken" in body && body.wabaAccessToken !== "***") data.wabaAccessToken = texto(body.wabaAccessToken).trim() || null;
    if ("wabaCoexistence" in body) data.wabaCoexistence = !!body.wabaCoexistence;
    if ("wabaTemplateForaJanela" in body) data.wabaTemplateForaJanela = texto(body.wabaTemplateForaJanela).trim() || null;
    if ("estadosCobranca" in body) data.estadosCobranca = texto(body.estadosCobranca) || null;
    if ("mensagemCobranca" in body) data.mensagemCobranca = texto(body.mensagemCobranca) || null;
    if ("aquecimentoAtivo" in body) {
      data.aquecimentoAtivo = !!body.aquecimentoAtivo;
      // Liga o cronômetro no momento em que o aquecimento é ativado — sem data,
      // não dá pra saber em que degrau da escada o número está.
      if (body.aquecimentoAtivo) data.aquecimentoDesde = new Date();
    }
    if ("limiteEnviosHora" in body) {
      // Teto pro mesmo bug de corrupção de linha (Int no schema) já corrigido
      // em /api/config, /api/users/[id] e /api/regras-cobranca.
      const n = Math.round(Number(body.limiteEnviosHora));
      data.limiteEnviosHora =
        body.limiteEnviosHora === "" || body.limiteEnviosHora == null || !Number.isFinite(n)
          ? null
          : Math.min(100000, Math.max(0, n)) || null;
    }
    if ("proxyServer" in body) data.proxyServer = texto(body.proxyServer) || null;
    if ("proxyUsername" in body) data.proxyUsername = texto(body.proxyUsername) || null;
    if ("proxyPassword" in body && body.proxyPassword !== "***") data.proxyPassword = texto(body.proxyPassword) || null;
  
    // WAHA só aceita [a-zA-Z0-9_-] no nome da sessão — mesma correção do
    // POST em app/api/numbers/route.js, aqui pro caso de editar a instância
    // (ou trocar o provider pra waha) de um número já cadastrado.
    if ("instance" in data) {
      const providerEfetivo = data.provider || (await prisma.whatsappNumber.findUnique({ where: { id }, select: { provider: true } }))?.provider;
      if (providerEfetivo === "waha") data.instance = wahaSessionSlug(data.instance);
    }

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
    // Senha do proxy também não volta em texto puro na resposta (a lista já escondia de quem não é admin).
    return NextResponse.json({ ...updated, wabaAccessToken: updated.wabaAccessToken ? "***" : null, proxyPassword: updated.proxyPassword ? "***" : null });
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
