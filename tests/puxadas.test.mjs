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
    return falhar ? { status: "erro", erro: "Falha simulada", suspender } : { status: "concluida", dados: { cpf, nome: "Teste fictício" } };
  } });
  try {
    await prisma.config.create({ data: { dataApiAtivo: false, dataApiKey: "chave-ficticia" } });
    const etapa = await prisma.stage.create({ data: { name: "Teste" } });
    const c = await prisma.contact.create({ data: { name: "Fictício", cpf: "529.982.247-25", stageId: etapa.id } });
    assert.equal((await servico.consultarContato(c.id)).http, 409);
    assert.equal(chamadas, 0);
    await prisma.config.update({ where: { id: "singleton" }, data: { dataApiAtivo: true } });
    await Promise.all([servico.consultarContato(c.id), servico.consultarContato(c.id)]);
    assert.equal(chamadas, 1, "dois cliques só podem consumir uma consulta");
    assert.equal(await prisma.consultaDataApi.count(), 1);
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
    assert.equal(await prisma.consultaDataApi.count(), 2, "CPF corrigido mantém histórico separado");

    await prisma.consultaDataApi.updateMany({ where: { cpf: "11144477735" }, data: { status: "consultando", dados: null, atualizadoEm: new Date(Date.now() - 180000) } });
    const interrompida = await servico.consultarContato(c.id);
    assert.equal(interrompida.registro.status, "erro");
    assert.equal(chamadas, 3, "reinício não repete chamada possivelmente cobrada");

    await prisma.consultaDataApi.updateMany({ where: { cpf: "11144477735" }, data: { atualizadoEm: new Date(Date.now() - 65000) } });
    falhar = true; suspender = true;
    await servico.consultarContato(c.id, { repetir: true });
    assert.equal(chamadas, 4);
    assert.equal((await prisma.config.findUnique({ where: { id: "singleton" } })).dataApiErro, "Falha simulada");
    await servico.consultarContato(c.id);
    assert.equal(chamadas, 4, "suspensão deve impedir novas cobranças");
    assert.equal(JSON.stringify(auditoria).includes("52998224725"), false);
    assert.equal(JSON.stringify(auditoria).includes("chave-ficticia"), false);
    await prisma.contact.delete({ where: { id: c.id } });
    assert.equal(await prisma.consultaDataApi.count(), 0, "exclusão definitiva apaga as puxadas");
  } finally {
    await prisma.$disconnect();
    assert.ok(resolve(pasta).startsWith(resolve(tmpdir()) + "\\controller-puxadas-") || resolve(pasta).startsWith(resolve(tmpdir()) + "/controller-puxadas-"));
    rmSync(pasta, { recursive: true, force: true });
  }
});
