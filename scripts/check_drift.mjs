#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Gourmet Bites — Check de drift entre funciones fuente y sus copias en tests
// (v7.9.13 INF-02)
// ═══════════════════════════════════════════════════════════════════════════
// Los test_*.mjs copian helpers de los app-*.js para probarlos en aislamiento
// ("mantener sincronizado"). Este script verifica que esas copias NO se hayan
// desincronizado: extrae el texto de cada función de ambos lados (brace
// matching) y compara normalizando whitespace.
//
// Uso: node scripts/check_drift.mjs
// Sale con 0 si todas las copias están sincronizadas, 1 si alguna difiere.
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync, existsSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
let ROOT = process.cwd();
if (!existsSync(join(ROOT, "index.html")) || !existsSync(join(ROOT, "app-core.js"))) {
  ROOT = resolve(__dirname, "..");
}

// ─── Config: (función, archivo fuente, archivo test con la copia) ───────────
const ENTRIES = [
  // test_dinero.mjs (v7.9.13)
  ["getPagos",            "app-historial.js",  "scripts/test_dinero.mjs"],
  ["totalCobrado",        "app-historial.js",  "scripts/test_dinero.mjs"],
  ["totalAjustes",        "app-historial.js",  "scripts/test_dinero.mjs"],
  ["saldoPendiente",      "app-historial.js",  "scripts/test_dinero.mjs"],
  ["saldoNeto",           "app-historial.js",  "scripts/test_dinero.mjs"],
  ["creditoAFavor",       "app-historial.js",  "scripts/test_dinero.mjs"],
  // v7.9.13 ARQ-02: getDocTotal y computePropTotal movidas a app-core.js
  ["getDocTotal",         "app-core.js",       "scripts/test_dinero.mjs"],
  ["computePropTotal",    "app-core.js",       "scripts/test_dinero.mjs"],
  ["TR",                  "app-core.js",       "scripts/test_dinero.mjs"],
  // copias preexistentes (verificadas sincronizadas al crear este script)
  ["getDespachos",            "app-core.js", "scripts/test_despachos.mjs"],
  ["getTransporteTotal",      "app-core.js", "scripts/test_despachos.mjs"],
  ["getDespachoStatusAgregado","app-core.js","scripts/test_despachos.mjs"],
  ["tieneDespachosExplicitos","app-core.js", "scripts/test_despachos.mjs"],
  ["getMenajeOpciones",       "app-core.js", "scripts/test_menaje.mjs"],
  ["getMenajeOpcionActiva",   "app-core.js", "scripts/test_menaje.mjs"],
  ["getMenajeItemsActivos",   "app-core.js", "scripts/test_menaje.mjs"],
  ["getReposicionActivos",    "app-core.js", "scripts/test_menaje.mjs"],
  ["tieneMenajeOpciones",     "app-core.js", "scripts/test_menaje.mjs"],
  ["OPERATIONAL_FIELDS",      "app-core.js", "scripts/test_merge_operational.mjs"],
  ["mergeOperationalFields",  "app-core.js", "scripts/test_merge_operational.mjs"],
  ["computePropTotal",   "app-core.js",      "scripts/test_proptotal_transporte.mjs"], // v7.9.13 ARQ-02: fuente movida
  ["TR",                 "app-core.js",      "scripts/test_proptotal_transporte.mjs"],
  ["getItemsVendidos",   "app-dashboard.js", "scripts/test_ventas_anteriores.mjs"],
];

// ─── Extracción: `function NOMBRE(`...`}` o `const NOMBRE =`...bracket close ─
function extractFn(src, name) {
  const reFn = new RegExp(`function\\s+${name}\\s*\\(`);
  const reConst = new RegExp(`const\\s+${name}\\s*=`);
  let m = reFn.exec(src);
  let isConst = false;
  if (!m) { m = reConst.exec(src); isConst = true; }
  if (!m) return null;
  const start = m.index;
  // buscar el primer bracket de apertura tras el inicio del match
  const OPEN = isConst ? "{[(" : "{";
  const CLOSE = { "{": "}", "[": "]", "(": ")" };
  let i = start + m[0].length;
  while (i < src.length && !OPEN.includes(src[i])) i++;
  if (i >= src.length) return null;
  const closer = CLOSE[src[i]];
  const opener = src[i];
  let depth = 0;
  let state = null; // null | "'" | '"' | "`" | "//" | "/*"
  for (; i < src.length; i++) {
    const ch = src[i], nx = src[i + 1];
    if (state === "//") { if (ch === "\n") state = null; continue; }
    if (state === "/*") { if (ch === "*" && nx === "/") { state = null; i++; } continue; }
    if (state) { // dentro de string
      if (ch === "\\") { i++; continue; }
      if (ch === state) state = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") { state = ch; continue; }
    if (ch === "/" && nx === "/") { state = "//"; i++; continue; }
    if (ch === "/" && nx === "*") { state = "/*"; i++; continue; }
    if (ch === opener) depth++;
    else if (ch === closer) {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return null;
}

// Normaliza: quita comentarios (// y /* */) preservando strings, y colapsa
// whitespace. Las copias de test suelen omitir comentarios del fuente — eso
// NO es drift funcional; solo el código debe coincidir.
function stripComments(s) {
  let out = "";
  let state = null; // null | "'" | '"' | "`"
  for (let i = 0; i < s.length; i++) {
    const ch = s[i], nx = s[i + 1];
    if (state) {
      out += ch;
      if (ch === "\\") { out += nx ?? ""; i++; continue; }
      if (ch === state) state = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") { state = ch; out += ch; continue; }
    if (ch === "/" && nx === "/") { while (i < s.length && s[i] !== "\n") i++; out += "\n"; continue; }
    if (ch === "/" && nx === "*") { i += 2; while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) i++; i++; continue; }
    out += ch;
  }
  return out;
}
const norm = (s) => stripComments(s).replace(/\s+/g, " ").trim();

// ─── Run ─────────────────────────────────────────────────────────────────────
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = useColor
  ? { g: "\x1b[32m", r: "\x1b[31m", b: "\x1b[1m", x: "\x1b[0m" }
  : { g: "", r: "", b: "", x: "" };

console.log(`${c.b}🔄 Gourmet Bites — check de drift fuente ↔ copias de test${c.x}`);
let errors = 0;
const cache = {};
const read = (rel) => (cache[rel] ??= readFileSync(join(ROOT, rel), "utf8"));

for (const [name, srcFile, testFile] of ENTRIES) {
  const label = `${name} (${srcFile} ↔ ${testFile})`;
  let srcTxt, testTxt;
  try { srcTxt = extractFn(read(srcFile), name); } catch { srcTxt = null; }
  try { testTxt = extractFn(read(testFile), name); } catch { testTxt = null; }
  if (!srcTxt) { console.log(`  ${c.r}❌${c.x} ${label} — no pude extraer la función del FUENTE`); errors++; continue; }
  if (!testTxt) { console.log(`  ${c.r}❌${c.x} ${label} — no pude extraer la copia del TEST`); errors++; continue; }
  if (norm(srcTxt) === norm(testTxt)) {
    console.log(`  ${c.g}✅${c.x} ${label}`);
  } else {
    console.log(`  ${c.r}❌${c.x} ${label} — DESINCRONIZADA`);
    // diff simple línea a línea (normalizando whitespace por línea)
    const a = srcTxt.split("\n").map((l) => l.trim()).filter(Boolean);
    const b = testTxt.split("\n").map((l) => l.trim()).filter(Boolean);
    const max = Math.max(a.length, b.length);
    for (let i = 0; i < max; i++) {
      if ((a[i] || "") !== (b[i] || "")) {
        console.log(`      fuente L${i + 1}: ${a[i] || "(fin)"}`);
        console.log(`      test   L${i + 1}: ${b[i] || "(fin)"}`);
      }
    }
    errors++;
  }
}

console.log("");
if (errors === 0) {
  console.log(`${c.g}${c.b}✅ ${ENTRIES.length} copias sincronizadas${c.x}`);
  process.exit(0);
} else {
  console.log(`${c.r}${c.b}❌ ${errors} copia(s) desincronizada(s) — actualizar el test correspondiente${c.x}`);
  process.exit(1);
}
