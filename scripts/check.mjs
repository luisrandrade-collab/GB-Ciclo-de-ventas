#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Gourmet Bites — Pre-deploy check (CI mínimo)
// ═══════════════════════════════════════════════════════════════════════════
// Reemplaza scripts/check.sh para correr nativo en Windows/Linux/macOS sin Bash.
// Uso:
//   node scripts/check.mjs
// Sale con código 0 si TODO está OK. Cualquier fallo → exit 1.
//
// Checks:
//   1. node --check en los 7 JS frontend + functions/index.js (sintaxis)
//   2. BUILD_VERSION en app-core.js coincide con los 7 cache busters de index.html
//   3. Existencia de archivos clave (frontend + rules)
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync, existsSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Localizar raíz del proyecto: el script puede ejecutarse desde la raíz o desde scripts/
let ROOT = process.cwd();
if (!existsSync(join(ROOT, "index.html")) || !existsSync(join(ROOT, "app-core.js"))) {
  const up = resolve(__dirname, "..");
  if (existsSync(join(up, "index.html")) && existsSync(join(up, "app-core.js"))) {
    ROOT = up;
  } else {
    console.error("❌ No encuentro index.html + app-core.js");
    process.exit(1);
  }
}

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = useColor
  ? { g: "\x1b[32m", r: "\x1b[31m", y: "\x1b[33m", b: "\x1b[1m", x: "\x1b[0m" }
  : { g: "", r: "", y: "", b: "", x: "" };

let errors = 0;
let warnings = 0;
const pass = (m) => console.log(`  ${c.g}✅${c.x} ${m}`);
const fail = (m) => { console.log(`  ${c.r}❌${c.x} ${m}`); errors++; };
const warn = (m) => { console.log(`  ${c.y}⚠️${c.x} ${m}`); warnings++; };
const header = (m) => console.log(`\n${c.b}─── ${m} ───${c.x}`);

console.log(`${c.b}🍽️  Gourmet Bites — pre-deploy check${c.x}`);
console.log(`  Proyecto: ${ROOT}`);
console.log(`  Fecha:    ${new Date().toISOString().replace("T", " ").slice(0, 19)}`);

// ─── 1. Node disponible (siempre lo está si esto corre)
header("1. Node.js");
pass(`node ${process.version}`);

// ─── 2. Sintaxis JS
header("2. Sintaxis (node --check)");
const jsFiles = [
  "app-assets.js",
  "app-core.js",
  "app-cotizar.js",
  "app-propuesta.js",
  "app-historial.js",
  "app-seguimiento.js",
  "app-dashboard.js",
];
for (const f of jsFiles) {
  const p = join(ROOT, f);
  if (!existsSync(p)) { fail(`${f} no existe`); continue; }
  try {
    execSync(`node --check "${p}"`, { stdio: ["ignore", "ignore", "pipe"] });
    const lines = readFileSync(p, "utf8").split("\n").length;
    pass(`${f} (${lines} líneas)`);
  } catch (e) {
    fail(`${f} — SYNTAX ERROR`);
    const msg = e.stderr ? e.stderr.toString() : String(e);
    msg.split("\n").forEach((l) => l && console.log(`        ${l}`));
  }
}
const fxPath = join(ROOT, "functions/index.js");
if (existsSync(fxPath)) {
  try {
    execSync(`node --check "${fxPath}"`, { stdio: ["ignore", "ignore", "pipe"] });
    pass("functions/index.js");
  } catch (e) {
    fail("functions/index.js — SYNTAX ERROR");
    const msg = e.stderr ? e.stderr.toString() : String(e);
    msg.split("\n").forEach((l) => l && console.log(`        ${l}`));
  }
}

// ─── 3. Coherencia BUILD_VERSION ↔ cache busters
header("3. Coherencia BUILD_VERSION ↔ cache busters");
const coreSrc = readFileSync(join(ROOT, "app-core.js"), "utf8");
const m = coreSrc.match(/const\s+BUILD_VERSION\s*=\s*"(v[^"]+)"/);
const buildVer = m ? m[1] : null;
if (!buildVer) {
  fail("No pude extraer BUILD_VERSION de app-core.js");
} else {
  console.log(`  BUILD_VERSION: ${buildVer}`);
  const versionNum = buildVer.replace(/^v/, "");
  const htmlSrc = readFileSync(join(ROOT, "index.html"), "utf8");
  // v7.9.13 INF-04: contar matches POR ARCHIVO (no solo unicidad de versión):
  // si un <script> pierde su ?v=, antes pasaba igual. Ahora cada JS esperado
  // debe tener exactamente su buster con la versión de BUILD_VERSION.
  const reg = /<script\s+src="(app-[^"?]+\.js)\?v=([0-9]+\.[0-9]+\.[0-9]+(?:\.[0-9]+)?)"/g;
  const busters = new Map(); // archivo → versión
  let mm;
  while ((mm = reg.exec(htmlSrc)) !== null) busters.set(mm[1], mm[2]);
  let busterErrors = 0;
  for (const f of jsFiles) {
    if (!busters.has(f)) {
      fail(`<script src="${f}?v=..."> NO encontrado en index.html (falta cache buster o el tag)`);
      busterErrors++;
    } else if (busters.get(f) !== versionNum) {
      fail(`${f}: buster ?v=${busters.get(f)} ≠ BUILD_VERSION ${versionNum}`);
      busterErrors++;
    }
  }
  if (busterErrors === 0) {
    pass(`${jsFiles.length}/${jsFiles.length} <script ?v=${versionNum}> coinciden con BUILD_VERSION`);
  }
  // v7.9.13 INF-05: validar también el cache buster del CSS de tokens.
  const cssM = htmlSrc.match(/<link\s+rel="stylesheet"\s+href="gb-tokens\.css\?v=([0-9]+\.[0-9]+\.[0-9]+(?:\.[0-9]+)?)"/);
  if (!cssM) {
    fail(`<link href="gb-tokens.css?v=..."> NO encontrado en index.html (falta cache buster del CSS)`);
  } else if (cssM[1] !== versionNum) {
    fail(`gb-tokens.css: buster ?v=${cssM[1]} ≠ BUILD_VERSION ${versionNum}`);
  } else {
    pass(`gb-tokens.css?v=${versionNum} coincide con BUILD_VERSION (total: ${jsFiles.length} JS + 1 CSS)`);
  }
}

// ─── 4. Archivos clave presentes
header("4. Archivos clave presentes");
const expected = [
  "app-assets.js",
  "app-core.js",
  "app-cotizar.js",
  "app-propuesta.js",
  "app-historial.js",
  "app-seguimiento.js",
  "app-dashboard.js",
  "index.html",
  "firestore.rules",
  "storage.rules",
];
for (const f of expected) {
  if (existsSync(join(ROOT, f))) pass(f);
  else fail(`${f} — FALTA`);
}

// ─── Resumen
console.log("");
if (errors === 0 && warnings === 0) {
  console.log(`${c.g}${c.b}✅ TODO OK — listo para push${c.x}  (BUILD: ${buildVer || "?"})`);
  process.exit(0);
} else if (errors === 0) {
  console.log(`${c.y}${c.b}⚠️  ${warnings} advertencia(s)${c.x}`);
  process.exit(0);
} else {
  console.log(`${c.r}${c.b}❌ ${errors} error(es) · ${warnings} advertencia(s) — NO deployar${c.x}`);
  process.exit(1);
}
