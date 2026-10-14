import { prisma } from "@/lib/prisma";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { NextResponse } from "next/server";
import { lerCorpo, texto } from "@/lib/corpo";
import { finalizarCadastroIntegrado, getWabaConfig, infoNumeroWaba } from "@/lib/waba";

// Dados para o painel WABA do número: URL do webhook, verify token, configuração do Cadastro Integrado e estado na Meta.
export async function GET(req, { params }) {
  if (!isAdmin(await getCurrentUser().catch(() => null))) return NextResponse.json({ error: "Só administrador." }, { status: 403 });
  const { id } = await params;
  const num = await prisma.whatsappNumber.findUnique({ where: { id } });
  if (!num) return NextResponse.json({ error: "Número não encontrado" }, { status: 404 });
  const cfg = await getWabaConfig();
  const proto = (req.headers.get("x-forwarded-proto") || "https").split(",")[0].trim();
  const host = req.headers.get("host");
  const info = num.provider === "waba" ? await infoNumeroWaba(num, { forcar: true }) : null;
  return NextResponse.json({
    webhookUrl: host ? `${proto}://${host}/api/webhook/waba` : "",
    verifyToken: cfg.verifyToken,
    appId: cfg.appId,
    configId: cfg.configId,
    cadastroIntegradoPronto: !!(cfg.appId && cfg.configId && cfg.appSecret),
    info: info ? { state: info.state, numero: info.display, nome: info.nome, qualidade: info.qualidade, plataforma: info.plataforma, erro: info.error || null } : null,
  });
}

// Finaliza o Cadastro Integrado (inclui a coexistência com o app WhatsApp Business): troca o code pelo token
// e inscreve o app na conta para o webhook passar a chegar.
export async function POST(req, { params }) {
  if (!isAdmin(await getCurrentUser().catch(() => null))) return NextResponse.json({ error: "Só administrador." }, { status: 403 });
  const { id } = await params;
  const body = await lerCorpo(req);
  const code = texto(body.code).trim();
  if (!code) return NextResponse.json({ error: "A Meta não devolveu o código de autorização." }, { status: 400 });
  const r = await finalizarCadastroIntegrado({
    numeroId: id,
    code,
    phoneNumberId: texto(body.phoneNumberId).replace(/\D/g, ""),
    wabaId: texto(body.wabaId).replace(/\D/g, ""),
    coexistencia: !!body.coexistencia,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 });
  return NextResponse.json({ ok: true });
}
