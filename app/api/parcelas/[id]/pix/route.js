import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { gerarPixCopiaECola, gerarPixQrCodeDataUrl } from "@/lib/pix";
import { valorParcelaAtual } from "@/lib/finance";
import { negarSeNaoPodeVerContato } from "@/lib/contatoAcesso";

export async function GET(_req, { params }) {
  const { id } = await params;
  // Aqui a chave é o id da PARCELA, não do contato — sem essa checagem dava
  // pra mexer no dinheiro (dar baixa, mudar vencimento, pedir desconto) de um
  // lead de outra pessoa só trocando o id na URL.
  const _p = await prisma.parcela.findUnique({ where: { id }, select: { contactId: true } });
  if (!_p) return NextResponse.json({ error: "Parcela não encontrada." }, { status: 404 });
  const negado = await negarSeNaoPodeVerContato(_p.contactId);
  if (negado) return negado;
  const [parcela, cfg] = await Promise.all([
    prisma.parcela.findUnique({ where: { id }, include: { contact: { select: { name: true } } } }),
    prisma.config.findUnique({ where: { id: "singleton" } }),
  ]);
  if (!parcela) return NextResponse.json({ error: "Parcela não encontrada." }, { status: 404 });
  if (!cfg?.pixChave) {
    return NextResponse.json({ error: "Chave Pix não configurada em Configurações." }, { status: 400 });
  }

  const valor = valorParcelaAtual(parcela, undefined, { multaPct: cfg.multaPct, horaLimite: cfg.pagamentoHoraLimite });
  const txid = `p${parcela.number}${parcela.id.slice(-8)}`;

  const payload = gerarPixCopiaECola({
    chave: cfg.pixChave,
    nome: cfg.pixNomeRecebedor,
    cidade: cfg.pixCidade,
    valor,
    txid,
  });
  const qrCodeDataUrl = await gerarPixQrCodeDataUrl(payload);

  return NextResponse.json({ payload, qrCodeDataUrl, valor, cliente: parcela.contact?.name });
}
