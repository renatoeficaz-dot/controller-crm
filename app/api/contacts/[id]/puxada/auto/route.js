import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { saveMediaBuffer } from "@/lib/mediaStorage";
import { consultarCpfDetetive } from "@/lib/detetiveForense";
import { gerarPuxadaPdfBuffer } from "@/lib/puxadaPdf";

export const runtime = "nodejs";

export async function POST(req, { params }) {
  const { id } = await params;
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

    const resultado = await consultarCpfDetetive(cpf);
    const pdf = await gerarPuxadaPdfBuffer(resultado);
    const fileName = `puxada-${cpf}.pdf`;
    const url = await saveMediaBuffer(pdf, "application/pdf", fileName);

    const updated = await prisma.contact.update({
      where: { id },
      data: { cpf, puxadaUrl: url, puxadaFileName: fileName, puxadaEm: new Date() },
      select: { cpf: true, puxadaUrl: true, puxadaFileName: true, puxadaEm: true },
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
