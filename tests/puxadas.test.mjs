import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { criarServicoPuxadas } from "../lib/puxadasServico.mjs";

test("reserva persistente, concorrência, repetição e troca de CPF em SQLite isolado", async () => {
  const pasta = mkdtempSync(join(tmpdir(), "controller-puxadas-"));
  // O engine SQLite do Prisma no Windows exige o arquivo antes do db push.
  writeFileSync(join(pasta, "teste.db"), "");
  const url = `file:${join(pasta, "teste.db").replaceAll("\\", "/")}`;
  const preparar = spawnSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "db", "push", "--skip-generate"], { env: { ...process.env, DATABASE_URL: url }, encoding: "utf8" });
  assert.equal(preparar.status, 0, preparar.stderr);
  const prisma = new PrismaClient({ datasourceUrl: url });
  const auditoria = [];
  let chamadas = 0;
  let falhar = false;
  let suspender = false;
  const servico = criarServicoPuxadas({ prisma, auditar: async (e) => auditoria.push(e), consultar: async (cpf) => {
    chamadas++;
    await new Promise((ok) => setTimeout(ok, 50));
    return falhar ? { status: "erro", erro: "Falha simulada", suspender } : { status: "concluida", dados: { telefones: ["5511900000000"] } };
  } });
  try {
    await prisma.config.create({ data: { snoopAtivo: false, snoopApiKey: "chave-ficticia" } });
    const etapa = await prisma.stage.create({ data: { name: "Teste" } });
    const c = await prisma.contact.create({ data: { name: "Fictício", cpf: "529.982.247-25", stageId: etapa.id } });
    assert.equal((await servico.consultarContato(c.id)).http, 409);
    assert.equal(chamadas, 0);
    await prisma.config.update({ where: { id: "singleton" }, data: { snoopAtivo: true } });
    await prisma.consultaDataApi.create({ data: { contactId: c.id, cpf: "52998224725", status: "concluida", dados: "{}" } });
    await Promise.all([servico.consultarContato(c.id), servico.consultarContato(c.id)]);
    assert.equal(chamadas, 1, "dois cliques só podem consumir uma consulta");
    assert.equal(await prisma.consultaDataApi.count(), 2, "DataAPI antiga não deve impedir consulta Snoop");
    await servico.consultarContato(c.id, { repetir: true });
    assert.equal(chamadas, 1, "resultado concluído não deve ser cobrado de novo");

    await prisma.contact.update({ where: { id: c.id }, data: { cpf: "11144477735" } });
    falhar = true;
    await servico.consultarContato(c.id);
    assert.equal(chamadas, 2);
    await servico.consultarContato(c.id);
    assert.equal(chamadas, 2, "falhas não são repetidas automaticamente");
    assert.equal((await servico.consultarContato(c.id, { repetir: true })).http, 429);
    await prisma.consultaDataApi.updateMany({ where: { cpf: "11144477735" }, data: { atualizadoEm: new Date(Date.now() - 65000) } });
    falhar = false;
    await Promise.all([servico.consultarContato(c.id, { repetir: true }), servico.consultarContato(c.id, { repetir: true })]);
    assert.equal(chamadas, 3, "repetição concorrente também precisa de reserva");
    assert.equal(await prisma.consultaDataApi.count(), 3, "CPF corrigido mantém histórico separado");

    await prisma.consultaDataApi.updateMany({ where: { cpf: "11144477735" }, data: { status: "consultando", dados: null, atualizadoEm: new Date(Date.now() - 180000) } });
    const interrompida = await servico.consultarContato(c.id);
    assert.equal(interrompida.registro.status, "erro");
    assert.equal(chamadas, 3, "reinício não repete chamada possivelmente cobrada");

    await prisma.consultaDataApi.updateMany({ where: { cpf: "11144477735" }, data: { atualizadoEm: new Date(Date.now() - 65000) } });
    falhar = true; suspender = true;
    await servico.consultarContato(c.id, { repetir: true });
    assert.equal(chamadas, 4);
    assert.equal((await prisma.config.findUnique({ where: { id: "singleton" } })).snoopErro, "Falha simulada");
    await servico.consultarContato(c.id);
    assert.equal(chamadas, 4, "suspensão deve impedir novas cobranças");
    assert.equal(JSON.stringify(auditoria).includes("52998224725"), false);
    assert.equal(JSON.stringify(auditoria).includes("chave-ficticia"), false);
    await prisma.config.update({ where: { id: "singleton" }, data: { snoopAtivo: false, snoopErro: null } });
    const c2 = await prisma.contact.create({ data: { name: "Segundo fictício", cpf: "52998224725", stageId: etapa.id } });
    falhar = false; suspender = false;
    const ambas = await servico.consultarTodas(c2.id, { automatico: false });
    assert.equal(ambas.resultados.length, 2, "consulta manual funciona mesmo com o automático desligado");
    assert.equal(chamadas, 6, "cadastro e telefones têm chamadas separadas");
    await prisma.consultaDataApi.updateMany({ where: { contactId: c2.id, versao: "snoop_telefones_v1" }, data: { status: "erro", dados: null, atualizadoEm: new Date(Date.now() - 65000) } });
    await servico.consultarTodas(c2.id, { automatico: false, repetir: true });
    assert.equal(chamadas, 7, "falha em telefones não repete o cadastro concluído");
    await prisma.config.update({ where: { id: "singleton" }, data: { snoopOpcoes: JSON.stringify({ consultas: [], campos: [] }) } });
    await servico.consultarTodas(c2.id, { automatico: false, repetir: true });
    assert.equal(chamadas, 7, "desabilitar todas impede chamadas mesmo ao repetir");
    const c3 = await prisma.contact.create({ data: { name: "Seleção fictícia", cpf: "52998224725", stageId: etapa.id } });
    await prisma.config.update({ where: { id: "singleton" }, data: { snoopOpcoes: JSON.stringify({ consultas: ["telefones"], campos: ["telefones"] }) } });
    await servico.consultarTodas(c3.id, { automatico: false });
    assert.equal(chamadas, 8, "consulta apenas o tipo habilitado");
    assert.deepEqual((await prisma.consultaDataApi.findMany({ where: { contactId: c3.id } })).map((r) => r.versao), ["snoop_telefones_v1"]);
    await prisma.contact.delete({ where: { id: c3.id } });
    await prisma.contact.delete({ where: { id: c2.id } });
    await prisma.contact.delete({ where: { id: c.id } });
    assert.equal(await prisma.consultaDataApi.count(), 0, "exclusão definitiva apaga as puxadas");
  } finally {
    await prisma.$disconnect();
    assert.ok(resolve(pasta).startsWith(resolve(tmpdir()) + "\\controller-puxadas-") || resolve(pasta).startsWith(resolve(tmpdir()) + "/controller-puxadas-"));
    rmSync(pasta, { recursive: true, force: true });
  }
});
