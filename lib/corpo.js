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

// Texto vindo do corpo da requisição, já aparado.
//
// O padrão antigo `(body.campo || "").trim()` derruba a rota com 500 quando o
// campo não é string: `(123 || "")` continua sendo 123, e número não tem
// .trim(). Vale pra objeto, array e boolean também — ou seja, qualquer cliente
// (e a rota de login, que é pública) conseguia provocar erro de servidor só
// mandando o tipo errado. Aqui, o que não for string vira string vazia.
export function texto(v) {
  return typeof v === "string" ? v.trim() : "";
}

// Mesma ideia pras rotas de upload: `req.formData()` LANÇA se o Content-Type
// não for multipart, então mandar JSON pra uma rota de anexo virava 500.
// Devolve null quando não veio formulário, pra rota responder 400.
export async function lerFormulario(req) {
  return req.formData().catch(() => null);
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
