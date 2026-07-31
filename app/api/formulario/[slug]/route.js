import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { onlyDigits } from "@/lib/evolution";
import { ufFromPhone } from "@/lib/ddd";

// Rota PÚBLICA (sem autenticação) — recebe o formulário de pré-cadastro
// preenchido antes do WhatsApp e cria o lead já com os campos preenchidos.
export async function GET(_req, { params }) {
  const { slug } = await params;
  const campanha = await prisma.linkCampanha.findUnique({ where: { slug } });
  if (!campanha) return NextResponse.json({ error: "Link não encontrado." }, { status: 404 });
  return NextResponse.json({
    nome: campanha.nome,
    campos: JSON.parse(campanha.formCampos || "[]"),
  });
}

export async function POST(req, { params }) {
  const { slug } = await params;
  const campanha = await prisma.linkCampanha.findUnique({ where: { slug }, include: { numero: true } });
  if (!campanha) return NextResponse.json({ error: "Link não encontrado." }, { status: 404 });

  const { respostas } = await req.json();
  // Nome e telefone são campos FIXOS da página pública (app/f/[slug]/page.js
  // sempre os pergunta, além do que foi configurado em formCampos) — vêm
  // direto em respostas.nome/respostas.telefone, não dentro de formCampos.
  const telDigits = onlyDigits(respostas?.telefone || "");

  if (!telDigits || telDigits.length < 10) {
    return NextResponse.json({ error: "Informe um WhatsApp válido." }, { status: 400 });
  }

  const tail = telDigits.slice(-8);
  let contact = await prisma.contact.findFirst({ where: { phone: { endsWith: tail } } });
  const camposCustom = JSON.stringify(respostas || {});

  if (contact) {
    await prisma.contact.update({ where: { id: contact.id }, data: { camposCustom, campanhaId: campanha.id } });
  } else {
    const first = await prisma.stage.findFirst({ orderBy: { order: "asc" } });
    if (!first) return NextResponse.json({ error: "Sistema sem configuração de funil." }, { status: 500 });
    contact = await prisma.contact.create({
      data: {
        name: respostas?.nome || telDigits,
        phone: telDigits,
        estado: ufFromPhone(telDigits),
        stageId: first.id,
        campanhaId: campanha.id,
        camposCustom,
      },
    });
  }

  const numero = onlyDigits(campanha.numero.number);
  const texto = `${campanha.mensagem ? campanha.mensagem + " " : ""}[ref:${campanha.slug}]`;
  return NextResponse.json({ ok: true, whatsappUrl: `https://wa.me/${numero}?text=${encodeURIComponent(texto)}` });
}
