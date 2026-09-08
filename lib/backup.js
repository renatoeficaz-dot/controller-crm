import { mkdir, readdir, stat, unlink } from "fs/promises";
import path from "path";
import { PrismaClient } from "@prisma/client";

const DIAS_RETENCAO = 14;

// O banco é um arquivo SQLite único — sem cópia, perder o arquivo é perder a
// operação inteira.
function dirBackups() {
  // Fica ao lado do arquivo do banco (volume persistente do container), e não
  // dentro do /app, que é recriado a cada deploy.
  const url = process.env.DATABASE_URL || "file:/data/prod.db";
  const arquivo = url.replace(/^file:/, "");
  return path.join(path.dirname(arquivo), "backups");
}

export function nomeBackupDoDia(dia = new Date().toLocaleDateString("en-CA")) {
  return `prod-${dia}.db`;
}

// Gera o snapshot do dia. Usa VACUUM INTO, e não cópia de arquivo: com o
// SQLite em modo WAL existem escritas pendentes fora do .db principal, então
// um `cp` produz um backup silenciosamente corrompido — o tipo de erro que só
// aparece no dia em que você precisa restaurar.
export async function rodarBackup() {
  const dir = dirBackups();
  await mkdir(dir, { recursive: true });

  const destino = path.join(dir, nomeBackupDoDia());
  // VACUUM INTO falha se o arquivo já existir — refazer o do dia é o esperado
  // quando o container reinicia, então apaga antes.
  await unlink(destino).catch(() => {});

  // Caminho vai direto na instrução (SQLite não aceita parâmetro aqui); o
  // valor é gerado por nós, nunca vem de entrada do usuário.
  //
  // Conexão PRÓPRIA, separada do `prisma` compartilhado: com
  // connection_limit=1 no DATABASE_URL (só 1 conexão pra todo o app, pra
  // evitar vários escritores brigando pelo lock do SQLite — ver lib/prisma.js),
  // um VACUUM INTO rodando na conexão compartilhada travava ELA SOZINHA pelo
  // tempo inteiro do backup, e todo request de usuário concorrente (abrir a
  // ficha de um lead, por exemplo) ficava na fila até estourar timeout — uma
  // rajada de "socket timeout" / 500 / 502 no fim do dia (ou a cada redeploy,
  // já que a trava de "1x por dia" reseta com o container). Isolado numa
  // conexão à parte, o VACUUM INTO não disputa a única conexão do app.
  const backupPrisma = new PrismaClient();
  try {
    await backupPrisma.$executeRawUnsafe(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
  } finally {
    await backupPrisma.$disconnect();
  }

  await limparAntigos(dir);
  const info = await stat(destino);
  return { arquivo: path.basename(destino), bytes: info.size };
}

async function limparAntigos(dir) {
  const limite = Date.now() - DIAS_RETENCAO * 86400000;
  for (const nome of await readdir(dir).catch(() => [])) {
    if (!nome.startsWith("prod-") || !nome.endsWith(".db")) continue;
    const completo = path.join(dir, nome);
    const info = await stat(completo).catch(() => null);
    if (info && info.mtimeMs < limite) await unlink(completo).catch(() => {});
  }
}

export async function listarBackups() {
  const dir = dirBackups();
  const nomes = await readdir(dir).catch(() => []);
  const out = [];
  for (const nome of nomes) {
    if (!nome.startsWith("prod-") || !nome.endsWith(".db")) continue;
    const info = await stat(path.join(dir, nome)).catch(() => null);
    if (info) out.push({ nome, bytes: info.size, em: info.mtime });
  }
  return out.sort((a, b) => b.nome.localeCompare(a.nome));
}

export function caminhoDoBackup(nome) {
  // Só aceita o padrão que nós mesmos geramos — impede subir de diretório e
  // baixar arquivo arbitrário do servidor pela rota de download.
  if (!/^prod-\d{4}-\d{2}-\d{2}\.db$/.test(nome)) return null;
  return path.join(dirBackups(), nome);
}
