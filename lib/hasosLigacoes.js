import { prisma } from "@/lib/prisma";
import { hasosFetch, listaDeInstancias } from "@/lib/hasos";

// Ligações da Hasos por dia. A API da Hasos devolve só as chamadas mais recentes (~150), então cada consulta copia
// as novas pra HasosChamada e o relatório lê do banco.
const fim8 = (v) => String(v || "").replace(/\D/g, "").slice(-8);
const diaBR = (d) => new Date(new Date(d).getTime() - 3 * 3600e3).toISOString().slice(0, 10);

let ultimaSync = 0;
let syncEmCurso = null;

export async function sincronizarChamadasHasos({ forcar = false } = {}) {
  if (!forcar && Date.now() - ultimaSync < 60e3) return { ok: true, pulou: true };
  if (syncEmCurso) return syncEmCurso;
  syncEmCurso = (async () => {
    const r = await hasosFetch("/v1/calls");
    if (!r.ok) return { ok: false, erro: r.erro };
    const lista = Array.isArray(r.data?.calls) ? r.data.calls : Array.isArray(r.data) ? r.data : [];
    const validas = lista.filter((c) => c?.id && c.startedAt && !isNaN(new Date(c.startedAt)));
    const ids = validas.map((c) => String(c.id));
    const existentes = new Map(
      (await prisma.hasosChamada.findMany({ where: { id: { in: ids } }, select: { id: true, endedAt: true } })).map((x) => [x.id, x])
    );
    const dados = (c) => ({
      whatsappCallId: c.whatsappCallId ? String(c.whatsappCallId) : null,
      instanceId: String(c.instanceId || ""),
      direction: String(c.direction || "").toUpperCase(),
      status: c.status ? String(c.status) : null,
      endReason: c.endReason ? String(c.endReason) : null,
      peerPhone: c.peerPhone ? String(c.peerPhone) : null,
      startedAt: new Date(c.startedAt),
      endedAt: c.endedAt && !isNaN(new Date(c.endedAt)) ? new Date(c.endedAt) : null,
      durationSec: Number.isFinite(Number(c.durationSec)) ? Math.round(Number(c.durationSec)) : null,
    });
    const novas = validas.filter((c) => !existentes.has(String(c.id)));
    if (novas.length) await prisma.hasosChamada.createMany({ data: novas.map((c) => ({ id: String(c.id), ...dados(c) })) });
    // Chamada que estava em curso na última cópia: atualiza quando termina.
    for (const c of validas) {
      const e = existentes.get(String(c.id));
      if (e && !e.endedAt && c.endedAt) await prisma.hasosChamada.update({ where: { id: e.id }, data: dados(c) }).catch(() => {});
    }
    await atribuirUsuarios();
    ultimaSync = Date.now();
    return { ok: true, novas: novas.length };
  })().finally(() => { syncEmCurso = null; });
  return syncEmCurso;
}

// Liga cada chamada FEITA a quem clicou em "Ligar": mesmo número da Hasos, mesmo telefone, até 3 min antes / 1 min depois.
async function atribuirUsuarios() {
  const semDono = await prisma.hasosChamada.findMany({
    where: { direction: "OUTGOING", userId: null, startedAt: { gte: new Date(Date.now() - 40 * 86400e3) } },
    select: { id: true, instanceId: true, peerPhone: true, startedAt: true },
  });
  for (const c of semDono) {
    const t = c.startedAt.getTime();
    const ds = await prisma.hasosDisparo.findMany({
      where: { instanceId: c.instanceId, criadoEm: { gte: new Date(t - 180e3), lte: new Date(t + 60e3) } },
      select: { userId: true, fone: true },
      orderBy: { criadoEm: "desc" },
    });
    const d = ds.find((x) => fim8(x.fone) && fim8(x.fone) === fim8(c.peerPhone));
    if (d) await prisma.hasosChamada.update({ where: { id: c.id }, data: { userId: d.userId } }).catch(() => {});
  }
}

export async function relatorioLigacoesHasos(de, ate) {
  const sync = await sincronizarChamadasHasos();
  const [chamadas, disparos, usuarios, numeros, inst] = await Promise.all([
    prisma.hasosChamada.findMany({ where: { startedAt: { gte: de, lt: ate } }, select: { instanceId: true, direction: true, durationSec: true, startedAt: true, userId: true } }),
    prisma.hasosDisparo.findMany({ where: { criadoEm: { gte: de, lt: ate } }, select: { ok: true, criadoEm: true, userId: true } }),
    prisma.user.findMany({ select: { id: true, name: true } }),
    prisma.whatsappNumber.findMany({ select: { label: true, number: true } }),
    hasosFetch("/v1/instances"),
  ]);
  const nomeUser = new Map(usuarios.map((u) => [u.id, u.name]));
  const instancias = inst.ok ? listaDeInstancias(inst.data) : [];
  const nomeInst = (id) => {
    const i = instancias.find((x) => x.id === id);
    const n = i && numeros.find((x) => fim8(x.number) && fim8(x.number) === fim8(i.phone));
    return n?.label || i?.nome || (i?.phone ? "Número final " + String(i.phone).slice(-4) : "Número removido");
  };

  const vazio = () => ({ feitas: 0, atendidas: 0, segundos: 0, recebidas: 0, falhas: 0 });
  const porDia = new Map();
  const porNumero = new Map();
  const porUsuario = new Map();
  const total = vazio();
  const pega = (m, k, extra) => { if (!m.has(k)) m.set(k, { ...vazio(), ...extra }); return m.get(k); };

  for (const c of chamadas) {
    const dia = pega(porDia, diaBR(c.startedAt), { dia: diaBR(c.startedAt) });
    const num = pega(porNumero, c.instanceId, { nome: nomeInst(c.instanceId) });
    if (c.direction === "OUTGOING") {
      const falou = (c.durationSec || 0) > 0;
      const u = pega(porUsuario, c.userId || "", { nome: c.userId ? nomeUser.get(c.userId) || "Usuário removido" : "Não identificado (antes do registro ou pelo celular)" });
      for (const o of [dia, num, total, u]) { o.feitas++; if (falou) o.atendidas++; o.segundos += c.durationSec || 0; }
    } else {
      for (const o of [dia, num, total]) o.recebidas++;
    }
  }
  // Clique em "Ligar" que a Hasos recusou (ex.: número desconectado): não vira chamada, mas aparece como falha.
  for (const d of disparos) {
    if (d.ok) continue;
    pega(porDia, diaBR(d.criadoEm), { dia: diaBR(d.criadoEm) }).falhas++;
    // A falha também aparece na linha de quem clicou (antes só no total do dia).
    pega(porUsuario, d.userId || "", { nome: d.userId ? nomeUser.get(d.userId) || "Usuário removido" : "Não identificado (antes do registro ou pelo celular)" }).falhas++;
    total.falhas++;
  }
  const desde = await prisma.hasosChamada.findFirst({ orderBy: { startedAt: "asc" }, select: { startedAt: true } });
  return {
    erroSync: sync.ok === false ? sync.erro : null,
    historicoDesde: desde ? diaBR(desde.startedAt) : null,
    total,
    dias: [...porDia.values()].sort((a, b) => b.dia.localeCompare(a.dia)),
    numeros: [...porNumero.values()].sort((a, b) => b.feitas - a.feitas || b.recebidas - a.recebidas),
    usuarios: [...porUsuario.values()].sort((a, b) => b.feitas - a.feitas),
  };
}
