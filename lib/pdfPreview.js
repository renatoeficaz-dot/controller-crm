import { writeFile, readFile, unlink } from "fs/promises";
import path from "path";
import os from "os";
import { randomUUID } from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// Converte a 1ª página de um PDF (base64) em JPEG (base64), usando o
// `pdftoppm` do poppler-utils (instalado no Dockerfile). Sem isso, todo PDF
// recebido (CNH digital, comprovante de residência, extrato bancário) era
// ignorado pela análise de visão — só imagem (jpeg/png) passava.
// Best-effort: PDF corrompido, sem texto de imagem, ou o binário não
// instalado (ex.: rodando local no Windows sem poppler) retorna null em vez
// de derrubar o resto do fluxo.
export async function pdfPrimeiraPaginaComoImagem(base64Pdf) {
  if (!base64Pdf) return null;
  const tmpBase = path.join(os.tmpdir(), `pdfpreview-${randomUUID()}`);
  const pdfPath = `${tmpBase}.pdf`;
  const outPrefix = `${tmpBase}-out`;
  try {
    await writeFile(pdfPath, Buffer.from(base64Pdf, "base64"));
    // -f 1 -l 1: só a primeira página. -r 150: resolução suficiente pra
    // legibilidade sem gerar um arquivo gigante.
    await execFileAsync("pdftoppm", ["-jpeg", "-f", "1", "-l", "1", "-r", "150", pdfPath, outPrefix], {
      timeout: 15000,
    });
    // pdftoppm nomeia o resultado com sufixo de página: "<prefix>-1.jpg" (ou
    // "<prefix>-01.jpg" dependendo da versão) — tenta os dois formatos comuns.
    for (const sufixo of ["-1.jpg", "-01.jpg"]) {
      try {
        const buf = await readFile(`${outPrefix}${sufixo}`);
        return { base64: buf.toString("base64"), mimetype: "image/jpeg" };
      } catch {
        // tenta o próximo sufixo
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    unlink(pdfPath).catch(() => {});
    for (const sufixo of ["-1.jpg", "-01.jpg"]) {
      unlink(`${outPrefix}${sufixo}`).catch(() => {});
    }
  }
}
