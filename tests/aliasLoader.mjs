// Loader só para os testes: o código do sistema importa "@/lib/..." (alias do Next); em Node puro isso precisa ser resolvido à mão.
// Uso: node --import ./tests/aliasRegister.mjs --test tests/*.test.mjs   (ou npm test)
import { pathToFileURL } from "node:url";
import { existsSync, statSync } from "node:fs";
import { resolve as pres } from "node:path";

const RAIZ = process.env.APP_ROOT || process.cwd();

export async function resolve(spec, ctx, next) {
  if (spec.startsWith("@/")) {
    const base = pres(RAIZ, spec.slice(2));
    for (const c of [base, base + ".js", base + ".mjs", pres(base, "index.js")]) {
      if (existsSync(c) && statSync(c).isFile()) return next(pathToFileURL(c).href, ctx);
    }
  }
  // "next/headers", "next/server"... sem extensão não resolvem em ESM puro.
  if (/^next\/[a-z-]+$/.test(spec)) return next(spec + ".js", ctx);
  return next(spec, ctx);
}
