#!/usr/bin/env node
// Ports the Cognisia rules engine (src/engine/*.ts, verbatim copies) to plain browser JS in assets/js/engine/.
// Mechanical only: Node's own TypeScript type stripping, then relative imports get ".js". No rule is touched by hand.
// node scripts/port-engine.mjs
import { stripTypeScriptTypes } from "node:module";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src/engine");
const OUT = join(ROOT, "assets/js/engine");

for (const f of readdirSync(SRC).filter((x) => x.endsWith(".ts"))) {
  const ts = readFileSync(join(SRC, f), "utf8");
  let js = stripTypeScriptTypes(ts, { mode: "strip" });
  js = js.replace(/(from\s+["'])(\.\.?\/[^"']+?)(["'])/g, (m, a, p, b) => (p.endsWith(".js") ? m : `${a}${p}.js${b}`));
  js = js
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+/, "");
  if (!js.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, "").trim()) {
    console.log(`skipped ${f} (types only)`);
    continue;
  }
  const head = `// Ported from src/engine/${f} by scripts/port-engine.mjs (types stripped, nothing else changed). Do not edit by hand.\n`;
  writeFileSync(join(OUT, f.replace(/\.ts$/, ".js")), head + js.trimEnd() + "\n");
  console.log(`ported ${f}`);
}
