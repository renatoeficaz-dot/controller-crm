import { NextResponse } from "next/server";

// Lê o corpo JSON de uma requisição e SEMPRE devolve um objeto simples.
//
// O padrão antigo (`await req.json().catch(() => ({}))`) deixava passar dois
// casos que derrubavam a rota com 500:
//   - corpo `null`: é JSON válido, o .catch não dispara, e o primeiro
//     `body.campo` estoura TypeError;
//   - corpo primitivo (`42`, `true`, `"abc"`): as rotas que testam
//     `if ("campo" in body)` estouram "Cannot use 'in' operator".
// Array também não serve: nenhuma rota espera lista no corpo.
export async function lerCorpo(req) {
  const bruto = await req.json().catch(() => null);
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return {};
  return bruto;
}

// Prisma lança P2025 quando o registro do `where` não existe. Sem tratar, um
// PATCH/DELETE em id inexistente (link velho, dois cliques, id chutado) virava
// 500 — erro de servidor pra uma situação que é só "não achei".
export function ehNaoEncontrado(err) {
  return err?.code === "P2025";
}

// Resposta padrão pra esse caso.
export function respostaNaoEncontrado(mensagem = "Registro não encontrado.") {
  return NextResponse.json({ error: mensagem }, { status: 404 });
}
