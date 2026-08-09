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

  const { respostas } = await req.json().catch(() => ({}));
  // Nome e telefone são campos FIXOS da página pública (app/f/[slug]/page.js
  // sempre os pergunta, além do que foi configurado em formCampos) — vêm
  // direto em respostas.nome/respostas.telefone, não dentro de formCampos.
  const telDigits = onlyDigits(respostas?.telefone || "");

  if (!telDigits || telDigits.length < 10) {
    return NextResponse.json({ error: "Informe um WhatsApp válido." }, { status: 400 });
  }

  // Rota pública, sem login. Sem limite, um POST anônimo com campos de texto
  // gigantes ia direto pro camposCustom (JSON em texto no SQLite) — já tivemos
  // o banco inflar até travar o servidor por causa de mídia sem limite, e isso
  // é o mesmo risco só que via texto em vez de arquivo.
  if (respostas && typeof respostas === "object") {
    for (const valor of Object.values(respostas)) {
      if (typeof valor === "string" && valor.length > 2000) {
        return NextResponse.json({ error: "Resposta muito longa em um dos campos." }, { status: 400 });
      }
    }
    if (JSON.stringify(respostas).length > 20000) {
      return NextResponse.json({ error: "Formulário muito grande." }, { status: 400 });
    }
  }

  const tail = telDigits.slice(-8);
  let contact = await prisma.contact.findFirst({ where: { phone: { endsWith: tail }, excluidoEm: null } });

  if (contact) {
    // Esta rota é PÚBLICA e sem login. Antes ela sobrescrevia camposCustom
    // inteiro: bastava saber o telefone de um cliente pra apagar tudo que a
    // equipe tinha preenchido nele (renda, empresa, observação interna) com um
    // POST anônimo. Agora MESCLA — o que já existia só é trocado se a pessoa
    // realmente respondeu aquele campo.
    const atuais = JSON.parse(contact.camposCustom || "{}");
    const novos = { ...atuais };
    for (const [chave, valor] of Object.entries(respostas || {})) {
      if (valor !== "" && valor != null) novos[chave] = valor;
    }
    await prisma.contact.update({
      where: { id: contact.id },
      data: {
        camposCustom: JSON.stringify(novos),
        // Atribuição é de PRIMEIRO toque (o schema diz isso): só marca a
        // campanha se o lead ainda não tiver uma, senão qualquer link novo
        // reescreveria de quem veio o cliente.
        ...(contact.campanhaId ? {} : { campanhaId: campanha.id }),
      },
    });
  } else {
    const camposCustom = JSON.stringify(respostas || {});
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
