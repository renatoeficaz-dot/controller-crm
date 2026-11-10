import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { registrarAuditoria } from "@/lib/auditoria";
import { lerCorpo, texto } from "@/lib/corpo";
import { cifrar } from "@/lib/segredo";

// Pluggy (Open Finance): credenciais e contas conectadas. O Client Secret é gravado CRIPTOGRAFADO e nunca volta nas respostas.
async function exigirAdmin() {
  const user = await getCurrentUser();
  if (!user) return { erro: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  if (!isAdmin(user)) return { erro: NextResponse.json({ error: "Sem permissão." }, { status: 403 }) };
  return { user };
}

export async function GET() {
  const { erro } = await exigirAdmin();
  if (erro) return erro;
  const [c, contas, bancos] = await Promise.all([
    prisma.config.findUnique({ where: { id: "singleton" }, select: { pluggyClientId: true, pluggySecretEnc: true } }),
    prisma.pluggyConta.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.banco.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true } }),
  ]);
  return NextResponse.json({
    clientId: c?.pluggyClientId || "",
    temSecret: !!c?.pluggySecretEnc,
    contas: contas.map((x) => ({ id: x.id, itemId: x.itemId, nome: x.nome, numero: x.numero, bancoId: x.bancoId, ativo: x.ativo, saldo: x.saldo, ultimaSync: x.ultimaSync, ultimoErro: x.ultimoErro })),
    bancos,
  });
}

export async function PUT(req) {
  const { user, erro } = await exigirAdmin();
  if (erro) return erro;
  const b = await lerCorpo(req);
  const data = {};
  if (b.clientId !== undefined) data.pluggyClientId = texto(b.clientId).trim() || null;
  const secret = texto(b.clientSecret).trim();
  if (secret) data.pluggySecretEnc = cifrar(secret); // vazio = mantém o atual
  await prisma.config.upsert({ where: { id: "singleton" }, update: data, create: { id: "singleton", ...data } });
  const { limparCachePluggy, testarCredenciais } = await import("@/lib/pluggyServidor");
  limparCachePluggy();
  registrarAuditoria({ usuario: user.name, acao: "config_pluggy", entidade: "Config", entidadeId: "singleton", detalhe: `campos: ${Object.keys(data).join(", ")}${secret ? " (secret atualizado)" : ""}` });
  try {
    await testarCredenciais();
    return NextResponse.json({ ok: true, valido: true });
  } catch (e) {
    return NextResponse.json({ ok: true, valido: false, aviso: e.message });
  }
}
