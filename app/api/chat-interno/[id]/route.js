import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { lerCorpo, texto } from "@/lib/corpo";
import { saveMediaBuffer } from "@/lib/mediaStorage";

// Só quem é membro enxerga/escreve na conversa — sem isso bastava trocar o id
// na URL pra ler a conversa dos outros.
async function membroOuNulo(conversaId, userId) {
  return prisma.conversaInternaMembro.findUnique({
    where: { conversaId_userId: { conversaId, userId } },
  });
}

// O que vem junto de cada mensagem na resposta da API.
const INCLUI_MENSAGEM = {
  autor: { select: { id: true, name: true } },
  atribuidoA: { select: { id: true, name: true } },
  mencionados: { select: { id: true, name: true } },
  // Lead encaminhado: o card é montado no front com esses campos.
  contact: {
    select: { id: true, name: true, phone: true, valorCapital: true, stage: { select: { name: true } } },
  },
  respondeA: {
    select: {
      id: true,
      body: true,
      mediaKind: true,
      autor: { select: { id: true, name: true } },
    },
  },
};

// Quem foi marcado com @ no texto. Em vez de confiar numa lista mandada pelo
// front (que pode divergir do texto), lê do próprio corpo casando com os
// nomes de quem está na conversa — assim o "@Fulano" escrito e a marcação
// gravada nunca ficam diferentes. Nome com espaço também casa ("@Arthur
// trabalho"), por isso testa do nome mais longo pro mais curto.
function acharMencionados(corpo, membros) {
  if (!corpo.includes("@")) return [];
  const texto = corpo.toLowerCase();
  const ordenados = [...membros].sort((a, b) => b.name.length - a.name.length);
  const achados = [];
  for (const m of ordenados) {
    if (texto.includes("@" + m.name.toLowerCase())) achados.push(m.id);
  }
  return achados;
}

// Mensagens da conversa (e marca como lida até agora).
export async function GET(_req, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const membro = await membroOuNulo(id, user.id);
  if (!membro) return NextResponse.json({ error: "Sem acesso a essa conversa." }, { status: 403 });

  const [conversa, mensagens] = await Promise.all([
    prisma.conversaInterna.findUnique({
      where: { id },
      include: { membros: { include: { user: { select: { id: true, name: true } } } } },
    }),
    prisma.mensagemInterna.findMany({
      where: { conversaId: id },
      orderBy: { createdAt: "asc" },
      take: 300,
      include: INCLUI_MENSAGEM,
    }),
  ]);

  await prisma.conversaInternaMembro
    .update({ where: { id: membro.id }, data: { lidoAte: new Date() } })
    .catch(() => {});

  return NextResponse.json({
    id: conversa.id,
    nome: conversa.nome,
    grupo: conversa.grupo,
    membros: conversa.membros.map((m) => ({ id: m.user.id, name: m.user.name })),
    mensagens,
  });
}

// Envia mensagem. Aceita JSON (só texto) ou multipart quando tem anexo —
// print colado, arquivo escolhido ou áudio gravado.
// - `atribuidoAId` transforma a mensagem num pedido de resolução
// - `respondeAId` cita outra mensagem da mesma conversa
export async function POST(req, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const membro = await membroOuNulo(id, user.id);
  if (!membro) return NextResponse.json({ error: "Sem acesso a essa conversa." }, { status: 403 });

  let corpo = "";
  let atribuidoAId = null;
  let respondeAId = null;
  let contactId = null;
  let midia = null;

  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const fd = await req.formData();
    corpo = texto(fd.get("body")) || "";
    atribuidoAId = texto(fd.get("atribuidoAId")) || null;
    respondeAId = texto(fd.get("respondeAId")) || null;
    contactId = texto(fd.get("contactId")) || null;
    const file = fd.get("file");
    if (file && typeof file === "object" && typeof file.arrayBuffer === "function") {
      const mime = file.type || "application/octet-stream";
      const kind = mime.startsWith("image/") ? "image" : mime.startsWith("audio/") ? "audio" : "document";
      try {
        const url = await saveMediaBuffer(Buffer.from(await file.arrayBuffer()), mime, file.name);
        midia = { mediaUrl: url, mediaKind: kind, mediaMime: mime, mediaNome: file.name || null };
      } catch (err) {
        return NextResponse.json({ error: err.message || "Falha ao salvar o anexo." }, { status: 400 });
      }
    }
  } else {
    const body = await lerCorpo(req);
    corpo = texto(body.body) || "";
    atribuidoAId = texto(body.atribuidoAId) || null;
    respondeAId = texto(body.respondeAId) || null;
    contactId = texto(body.contactId) || null;
  }

  // Mensagem sem texto é válida quando tem anexo (um print, um áudio) ou
  // quando é só o encaminhamento de uma lead pra equipe olhar.
  if (!corpo && !midia && !contactId) {
    return NextResponse.json({ error: "Escreva uma mensagem." }, { status: 400 });
  }
  if (contactId) {
    const existe = await prisma.contact.findUnique({ where: { id: contactId }, select: { id: true } });
    if (!existe) return NextResponse.json({ error: "Lead não encontrada." }, { status: 400 });
  }
  if (corpo.length > 5000) return NextResponse.json({ error: "Mensagem muito longa." }, { status: 400 });

  // Só dá pra cobrar quem participa da conversa.
  if (atribuidoAId) {
    const alvo = await membroOuNulo(id, atribuidoAId);
    if (!alvo) return NextResponse.json({ error: "Essa pessoa não está na conversa." }, { status: 400 });
  }
  // Só dá pra citar mensagem da MESMA conversa — senão daria pra vazar o
  // trecho citado de uma conversa que a pessoa nem participa.
  if (respondeAId) {
    const orig = await prisma.mensagemInterna.findUnique({
      where: { id: respondeAId },
      select: { conversaId: true },
    });
    if (!orig || orig.conversaId !== id) {
      return NextResponse.json({ error: "Mensagem citada não é desta conversa." }, { status: 400 });
    }
  }

  const membros = await prisma.conversaInternaMembro.findMany({
    where: { conversaId: id },
    select: { user: { select: { id: true, name: true } } },
  });
  const mencoes = acharMencionados(corpo, membros.map((m) => m.user));

  const msg = await prisma.mensagemInterna.create({
    data: {
      conversaId: id,
      autorId: user.id,
      body: corpo,
      atribuidoAId,
      respondeAId,
      contactId,
      ...(mencoes.length ? { mencionados: { connect: mencoes.map((mid) => ({ id: mid })) } } : {}),
      ...(midia || {}),
    },
    include: INCLUI_MENSAGEM,
  });
  // updatedAt da conversa é o que ordena a lista por "mais recente".
  await prisma.conversaInterna.update({ where: { id }, data: { updatedAt: new Date() } }).catch(() => {});
  await prisma.conversaInternaMembro
    .update({ where: { id: membro.id }, data: { lidoAte: new Date() } })
    .catch(() => {});

  return NextResponse.json(msg);
}

// Exclui a conversa inteira (mensagens e membros vão junto por cascade).
// Só quem criou ou um admin — senão qualquer participante apagaria a
// conversa dos outros. Aqui é exclusão de verdade: conversa interna não
// tem histórico a preservar como o do cliente.
export async function DELETE(_req, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const membro = await membroOuNulo(id, user.id);
  if (!membro) return NextResponse.json({ error: "Sem acesso a essa conversa." }, { status: 403 });

  const conversa = await prisma.conversaInterna.findUnique({ where: { id }, select: { criadaPor: true } });
  if (conversa?.criadaPor !== user.name && !isAdmin(user)) {
    return NextResponse.json({ error: "Só quem criou (ou um admin) pode excluir a conversa." }, { status: 403 });
  }
  await prisma.conversaInterna.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
