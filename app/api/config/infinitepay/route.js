import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { registrarAuditoria } from "@/lib/auditoria";
import { lerCorpo, texto } from "@/lib/corpo";
import { cifrar } from "@/lib/segredo";
import { normalizarHandle } from "@/lib/linkPagamento";

// Configuração do link de pagamento InfinitePay. A chave de API (inchk_...) é gravada CRIPTOGRAFADA e nunca volta nas respostas.
async function exigirAdmin() {
  const user = await getCurrentUser();
  if (!user) return { erro: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  if (!isAdmin(user)) return { erro: NextResponse.json({ error: "Sem permissão." }, { status: 403 }) };
  return { user };
}

export async function GET() {
  const { erro } = await exigirAdmin();
  if (erro) return erro;
  const c = await prisma.config.findUnique({ where: { id: "singleton" } });
  const ultimos = await prisma.cobrancaLink.findMany({ orderBy: { createdAt: "desc" }, take: 10 });
  const nomes = new Map((await prisma.contact.findMany({ where: { id: { in: ultimos.map((l) => l.contactId) } }, select: { id: true, name: true } })).map((x) => [x.id, x.name]));
  return NextResponse.json({
    handle: c?.infinitepayHandle || "",
    temApiKey: !!c?.infinitepayApiKeyEnc,
    autoAtivo: !!c?.infinitepayAutoAtivo,
    enviarChave: c?.infinitepayEnviarChave !== false,
    avisoPago: !!c?.infinitepayAvisoPago,
    ultimos: ultimos.map((l) => ({ id: l.id, cliente: (nomes.get(l.contactId) || "").split("\n")[0], valor: l.valor, status: l.status, origem: l.origem, metodo: l.metodo, criadoEm: l.createdAt, pagoEm: l.pagoEm, erro: l.erro, url: l.url })),
  });
}

export async function PUT(req) {
  const { user, erro } = await exigirAdmin();
  if (erro) return erro;
  const b = await lerCorpo(req);
  const data = {};
  if (b.handle !== undefined) {
    const h = texto(b.handle) ? normalizarHandle(b.handle) : null;
    if (texto(b.handle) && !h) return NextResponse.json({ error: "InfiniteTag inválida (só letras, números, ponto, hífen e _)." }, { status: 400 });
    data.infinitepayHandle = h;
  }
  const key = texto(b.apiKey).trim();
  if (key) {
    if (!/^inchk_[A-Za-z0-9_-]{8,}$/.test(key)) return NextResponse.json({ error: "A chave de API da InfinitePay começa com inchk_." }, { status: 400 });
    data.infinitepayApiKeyEnc = cifrar(key);
  }
  if (b.autoAtivo !== undefined) data.infinitepayAutoAtivo = !!b.autoAtivo;
  if (b.enviarChave !== undefined) data.infinitepayEnviarChave = !!b.enviarChave;
  if (b.avisoPago !== undefined) data.infinitepayAvisoPago = !!b.avisoPago;
  await prisma.config.upsert({ where: { id: "singleton" }, update: data, create: { id: "singleton", ...data } });
  registrarAuditoria({ usuario: user.name, acao: "config_infinitepay", entidade: "Config", entidadeId: "singleton", detalhe: `campos: ${Object.keys(data).join(", ")}${key ? " (chave atualizada)" : ""}` });
  return NextResponse.json({ ok: true });
}
