import { NextResponse } from "next/server";
import { contatoComCaloteMesmoCpf } from "@/lib/cpfBloqueio";

// Consulta manual: digitar um CPF antes de cadastrar o lead, pra saber se ele
// já deu calote noutro cadastro (mesma checagem que roda automático ao mover
// pra Análise/Liberação/Recebimento, só que aqui é sob demanda).
export async function GET(req) {
  const cpf = new URL(req.url).searchParams.get("cpf") || "";
  const limpo = cpf.replace(/\D/g, "");
  if (limpo.length !== 11) {
    return NextResponse.json({ error: "Informe um CPF válido (11 dígitos)." }, { status: 400 });
  }
  const calote = await contatoComCaloteMesmoCpf(limpo, null);
  return NextResponse.json({ calote });
}
