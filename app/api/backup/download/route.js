import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { caminhoDoBackup, listarBackups } from "@/lib/backup";

export const runtime = "nodejs";

// Baixa um backup. O banco tem todos os dados dos clientes — só admin.
export async function GET(req) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });

  const pedido = new URL(req.url).searchParams.get("nome");
  const nome = pedido || (await listarBackups())[0]?.nome; // sem nome = o mais recente
  if (!nome) return NextResponse.json({ error: "Nenhum backup disponível ainda." }, { status: 404 });

  const caminho = caminhoDoBackup(nome);
  if (!caminho) return NextResponse.json({ error: "Nome de backup inválido." }, { status: 400 });

  try {
    const conteudo = await readFile(caminho);
    return new NextResponse(conteudo, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${nome}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Backup não encontrado." }, { status: 404 });
  }
}
