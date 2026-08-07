import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { saveMediaBuffer } from "@/lib/mediaStorage";
import { consultarCpfDetetive } from "@/lib/detetiveForense";
import { gerarPuxadaPdfBuffer } from "@/lib/puxadaPdf";
import { extrairDadosPuxada, calcularScore } from "@/lib/scoreCredito";
import { validarCPF } from "@/lib/cpf";
import { negarSeNaoPodeVerContato } from "@/lib/contatoAcesso";

export const runtime = "nodejs";

export async function POST(req, { params }) {
  const { id } = await params;
  const negado = await negarSeNaoPodeVerContato(id);
  if (negado) return negado;
  try {
    const body = await req.json().catch(() => ({}));
    const contact = await prisma.contact.findUnique({
      where: { id },
      select: { id: true, cpf: true },
    });
    if (!contact) return NextResponse.json({ error: "Lead nao encontrado." }, { status: 404 });

    const cpf = String(body.cpf || contact.cpf || "").replace(/\D/g, "");
    if (cpf.length !== 11) {
      return NextResponse.json({ error: "Informe um CPF valido no card da lead antes de puxar." }, { status: 400 });
    }
    // Mesma validação do dígito verificador que trava o botão no front — aqui
    // de novo pra ninguém gastar consulta paga chamando a API direto.
    if (!validarCPF(cpf)) {
      return NextResponse.json({ error: "Esse CPF não é válido (dígito verificador não bate)." }, { status: 400 });
    }

    const resultado = await consultarCpfDetetive(cpf);
    const pdf = await gerarPuxadaPdfBuffer(resultado);
    const fileName = `puxada-${cpf}.pdf`;
    const url = await saveMediaBuffer(pdf, "application/pdf", fileName);

    // A mesma consulta que virou PDF também alimenta o score — assim o dado
    // fica consultável no card e nos relatórios, não só dentro do arquivo.
    const dados = extrairDadosPuxada(resultado);
    const score = calcularScore(dados);

    const updated = await prisma.contact.update({
      where: { id },
      data: {
        cpf,
        puxadaUrl: url,
        puxadaFileName: fileName,
        puxadaEm: new Date(),
        puxadaRenda: dados.renda,
        puxadaClasse: dados.classe,
        puxadaEmprestimos: dados.emprestimos,
        puxadaCcf: dados.ccf,
        puxadaProcessos: dados.processos,
        puxadaObito: dados.obito,
        puxadaScore: score.score,
        puxadaRisco: score.risco,
        puxadaLimite: score.limite,
        puxadaMotivos: score.motivos.join("|"),
      },
      select: {
        cpf: true, puxadaUrl: true, puxadaFileName: true, puxadaEm: true,
        puxadaRenda: true, puxadaClasse: true, puxadaEmprestimos: true,
        puxadaCcf: true, puxadaProcessos: true, puxadaObito: true,
        puxadaScore: true, puxadaRisco: true, puxadaLimite: true, puxadaMotivos: true,
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error("Falha na puxada automatica:", err);
    return NextResponse.json(
      { error: err?.message || "Falha ao consultar e anexar a puxada." },
      { status: 500 },
    );
  }
}
