import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { negarSeNaoPodeVerContato } from "@/lib/contatoAcesso";
import { consultarCnpjDoContato } from "@/lib/cnpja";

// Consulta o CNPJ do lead na CNPJá (situação cadastral, atividade, endereço, sócios). Sem custo — só respeita o limite da API.
export async function POST(req, { params }) {
  const { id } = await params;
  const negado = await negarSeNaoPodeVerContato(id);
  if (negado) return negado;
  const body = await req.json().catch(() => ({}));
  // Permite consultar o CNPJ digitado na tela antes de salvar a ficha.
  if (body.cnpj) await prisma.contact.update({ where: { id }, data: { cnpj: String(body.cnpj).replace(/\D/g, "") } }).catch(() => {});
  const r = await consultarCnpjDoContato(id, { forcar: !!body.forcar });
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 400 });
  const contato = await prisma.contact.findUnique({ where: { id }, select: { razaoSocial: true, enderecoComercial: true } });
  return NextResponse.json({ dados: r.dados, razaoSocial: contato?.razaoSocial || null, enderecoComercial: contato?.enderecoComercial || null });
}
