// Falha se algum arquivo de código tiver caractere de controle (ex.: \b virando backspace dentro de regex).
const fs = require("fs");
const path = require("path");
let ruim = 0;
function varrer(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (f.name === "node_modules" || f.name === ".next" || f.name.startsWith(".")) continue;
    const p = path.join(dir, f.name);
    if (f.isDirectory()) varrer(p);
    else if (/\.(js|jsx)$/.test(f.name)) {
      const t = fs.readFileSync(p, "utf8");
      if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(t)) { console.error("caractere de controle em", p); ruim++; }
    }
  }
}
["lib", "app", "components"].forEach((d) => fs.existsSync(d) && varrer(d));
process.exit(ruim ? 1 : 0);
