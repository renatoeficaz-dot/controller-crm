import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { negarSeNaoPodeVerContato } from "@/lib/contatoAcesso";
import { getCurrentUser } from "@/lib/session";
import { consultarPuxadaDoContato } from "@/lib/puxadas";
import { VERSOES_SNOOP } from "@/lib/snoopCliente.mjs";

const responder = (corpo, status = 200) => NextResponse.json(corpo, { status, headers: { "Cache-Control": "private, no-store" } });

export async function GET(_req, { params }) {
  const { id } = await params;
  const negado = await negarSeNaoPodeVerContato(id);
  if (negado) return negado;
  const contato = await prisma.contact.findUnique({ where: { id }, select: { cpf: true, excluidoEm: true } });
  if (!contato || contato.excluidoEm) return responder({ error: "Contato não encontrado." }, 404);
  const [consultas, cfg] = await Promise.all([
    prisma.consultaDataApi.findMany({ where: { contactId: id, versao: { in: Object.values(VERSOES_SNOOP) } }, orderBy: { atualizadoEm: "desc" } }),
    prisma.config.findUnique({ where: { id: "singleton" }, select: { snoopAtivo: true, snoopApiKey: true, snoopErro: true } }),
  ]);
  return responder({ cpf: contato.cpf, ativo: !!cfg?.snoopApiKey, automatico: !!cfg?.snoopAtivo, suspensao: cfg?.snoopErro || null, consultas: consultas.map((c) => ({ ...c, tipo: c.versao === VERSOES_SNOOP.cadastro ? "cadastro" : "telefones", dados: c.dados ? JSON.parse(c.dados) : null })) });
}

export async function POST(req, { params }) {
  const { id } = await params;
  const negado = await negarSeNaoPodeVerContato(id);
  if (negado) return negado;
  const body = await req.json().catch(() => ({}));
  const user = await getCurrentUser();
  // CPF vem somente da ficha autorizada; não permite consultar documentos arbitrários.
  try {
    const resultado = await consultarPuxadaDoContato(id, { repetir: body?.repetir === true, usuario: user?.name, automatico: false });
    if (resultado.erro) return responder({ error: resultado.erro }, resultado.http || 400);
    return responder({ ok: true });
  } catch {
    return responder({ error: "Não foi possível concluir a consulta. Recarregue a ficha para conferir o estado." }, 503);
  }
}
