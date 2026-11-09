import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { registrarAuditoria } from "@/lib/auditoria";
import { lerCorpo, texto } from "@/lib/corpo";
import { cifrar } from "@/lib/segredo";
import { EVENTO_PADRAO, ETAPA_PADRAO } from "@/lib/metaFunil";

// Integração Conversions API (avanço da lead -> Meta). O token é gravado CRIPTOGRAFADO e nunca volta nas respostas.
async function exigirAdmin() {
  const user = await getCurrentUser();
  if (!user) return { erro: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  if (!isAdmin(user)) return { erro: NextResponse.json({ error: "Sem permissão." }, { status: 403 }) };
  return { user };
}

export async function GET() {
  const { erro } = await exigirAdmin();
  if (erro) return erro;
  const c = await prisma.config.findUnique({ where: { id: "singleton" }, select: { metaCapiAtivo: true, metaCapiDatasetId: true, metaCapiTokenEnc: true, metaCapiEtapa: true, metaCapiEvento: true, metaCapiTesteCodigo: true } });
  return NextResponse.json({
    ativo: !!c?.metaCapiAtivo,
    datasetId: c?.metaCapiDatasetId || "",
    temToken: !!c?.metaCapiTokenEnc,
    etapa: c?.metaCapiEtapa || ETAPA_PADRAO,
    evento: c?.metaCapiEvento || EVENTO_PADRAO,
    testeCodigo: c?.metaCapiTesteCodigo || "",
  });
}

export async function PUT(req) {
  const { user, erro } = await exigirAdmin();
  if (erro) return erro;
  const b = await lerCorpo(req);
  const data = {};
  if (b.datasetId !== undefined) {
    const id = texto(b.datasetId).replace(/\D/g, "");
    data.metaCapiDatasetId = id || null;
  }
  const token = texto(b.token);
  if (token) data.metaCapiTokenEnc = cifrar(token); // vazio = mantém o atual
  if (b.etapa !== undefined) data.metaCapiEtapa = texto(b.etapa) || null;
  if (b.evento !== undefined) {
    const ev = texto(b.evento);
    if (ev && !/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(ev)) return NextResponse.json({ error: "Nome do evento: só letras, números e _." }, { status: 400 });
    data.metaCapiEvento = ev || null;
  }
  if (b.testeCodigo !== undefined) data.metaCapiTesteCodigo = texto(b.testeCodigo) || null;
  if (b.ativo !== undefined) data.metaCapiAtivo = !!b.ativo;
  await prisma.config.upsert({ where: { id: "singleton" }, update: data, create: { id: "singleton", ...data } });
  // Auditoria registra QUE mudou, nunca o valor do token.
  registrarAuditoria({ usuario: user.name, acao: "config_meta_capi", entidade: "Config", entidadeId: "singleton", detalhe: `campos: ${Object.keys(data).join(", ")}${token ? " (token atualizado)" : ""}` });
  return NextResponse.json({ ok: true });
}
