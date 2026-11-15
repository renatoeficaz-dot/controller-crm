import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { onlyDigits } from "@/lib/evolution";
import { ufFromPhone } from "@/lib/ddd";
import { lerCorpo } from "@/lib/corpo";
import { ipDoCliente } from "@/lib/ipCliente";

// Formulário é público: sem teto, um script criava milhares de leads falsos (e cada um entra no funil e pode acionar a IA).
const envioPorIp = new Map();
function muitosEnvios(ip) {
  const agora = Date.now();
  const e = envioPorIp.get(ip);
  if (!e || agora - e.inicio > 3600e3) { envioPorIp.set(ip, { inicio: agora, n: 1 }); return false; }
  e.n += 1;
  if (envioPorIp.size > 5000) envioPorIp.clear();
  return e.n > 10; // 10 envios por hora por IP
}

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

  if (muitosEnvios(ipDoCliente(req))) return NextResponse.json({ error: "Muitos envios. Tente mais tarde." }, { status: 429 });
  const { respostas: bruto } = await lerCorpo(req);
  // Só os campos que o formulário tem (nome, telefone e os configurados na campanha), e só texto. Antes qualquer chave ia parar no
  // cadastro do cliente — dava pra gravar campo personalizado arbitrário (inclusive os que a equipe usa na análise) num lead real.
  const permitidas = new Set(["nome", "telefone", ...JSON.parse(campanha.formCampos || "[]").map((c) => c?.chave).filter(Boolean)]);
  const respostas = {};
  for (const [k, v] of Object.entries(bruto && typeof bruto === "object" ? bruto : {})) if (permitidas.has(k) && typeof v === "string") respostas[k] = v;
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

  // Busca pelo número completo (DDD + 8 últimos dígitos, com ou sem o 9). Antes bastavam os 8 últimos dígitos, e quem enviasse o
  // formulário com um telefone qualquer caía no cadastro de outro cliente que terminasse igual.
  const tail = telDigits.slice(-8);
  const ddd = telDigits.replace(/^55/, "").slice(0, 2);
  const candidatos = await prisma.contact.findMany({ where: { phone: { endsWith: tail }, excluidoEm: null }, take: 20 });
  let contact = candidatos.find((c) => onlyDigits(c.phone).replace(/^55/, "").slice(0, 2) === ddd) || null;

  if (contact) {
    // Esta rota é PÚBLICA e sem login. Antes ela sobrescrevia camposCustom
    // inteiro: bastava saber o telefone de um cliente pra apagar tudo que a
    // equipe tinha preenchido nele (renda, empresa, observação interna) com um
    // POST anônimo. Agora MESCLA — o que já existia só é trocado se a pessoa
    // realmente respondeu aquele campo.
    const atuais = JSON.parse(contact.camposCustom || "{}");
    const novos = { ...atuais };
    // Lead que já existe: o formulário só PREENCHE o que está vazio, nunca troca o que a equipe já tem (quem soubesse o telefone de
    // um cliente conseguia reescrever os dados dele pelo link público).
    for (const [chave, valor] of Object.entries(respostas || {})) {
      if (valor !== "" && valor != null && (atuais[chave] == null || atuais[chave] === "")) novos[chave] = valor;
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
