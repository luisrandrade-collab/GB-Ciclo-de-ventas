#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Test aislado de getItemsVendidos (v7.9.11 — Ventas anteriores por cliente).
// ═══════════════════════════════════════════════════════════════════════════
// Uso: node scripts/test_ventas_anteriores.mjs
// Sale con 0 si todos los casos pasan, 1 si alguno falla.
//
// Por qué copia el helper de app-dashboard.js (no lo importa):
//   app-dashboard.js es UMD-style sin export, cargado por <script>. Igual que
//   los otros test_*.mjs, copiamos la función aquí para probarla en aislamiento.
//   Si la firma cambia, actualizar este archivo.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Copia de app-dashboard.js (mantener sincronizado) ──────────────────────

function getItemsVendidos(q){
  if(!q)return [];
  const out=[];
  const push=(nombre,desc,unidad,qty,precioUnit)=>{
    const c=Number(qty)||0,p=Number(precioUnit)||0;
    out.push({nombre:nombre||"—",desc:desc||"",unidad:unidad||"",qty:c,precioUnit:p,subtotal:c*p});
  };
  if(q.kind==="proposal"){
    (q.sections||[]).forEach(sec=>{
      if(sec.incluirEnTotal===false)return;
      (sec.options||[]).forEach(opt=>{
        if(opt.label==="Opción A"||(sec.options||[]).length===1){
          (opt.items||[]).forEach(it=>push(it.name,it.desc,it.unit,it.qty,it.price));
        }
      });
    });
  }else{
    (q.cart||[]).forEach(it=>push(it.n,it.d,it.u,it.qty,it.p));
    (q.cust||[]).forEach(it=>push(it.n,it.d,it.u,it.qty,it.p));
  }
  return out;
}

// ─── Framework mínimo de testing ────────────────────────────────────────────

let pass = 0, fail = 0;
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = useColor
  ? { g: "\x1b[32m", r: "\x1b[31m", b: "\x1b[1m", x: "\x1b[0m" }
  : { g: "", r: "", b: "", x: "" };

function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ${c.g}✅${c.x} ${label}`);
    pass++;
  } else {
    console.log(`  ${c.r}❌${c.x} ${label}\n      esperado: ${e}\n      actual:   ${a}`);
    fail++;
  }
}

function describe(name, fn) {
  console.log(`\n${c.b}─── ${name} ───${c.x}`);
  fn();
}

// ─── Casos de prueba ────────────────────────────────────────────────────────

describe("Caso 1: quote con cart + cust (catálogo + personalizados)", () => {
  const q = {
    kind: "quote",
    cart: [{ n: "Canapé salmón", d: "x12", u: "docena", p: 24000, qty: 3 }],
    cust: [{ n: "Torta personalizada", p: 80000, qty: 1 }],
  };
  const out = getItemsVendidos(q);
  eq(out.length, 2, "dos líneas (1 cart + 1 cust)");
  eq(out[0], { nombre: "Canapé salmón", desc: "x12", unidad: "docena", qty: 3, precioUnit: 24000, subtotal: 72000 }, "cart: subtotal = p*qty");
  eq(out[1], { nombre: "Torta personalizada", desc: "", unidad: "", qty: 1, precioUnit: 80000, subtotal: 80000 }, "cust: campos opcionales por defecto");
});

describe("Caso 2: proposal — solo Opción A de cada sección incluida cuenta", () => {
  const q = {
    kind: "proposal",
    sections: [
      { name: "Plato Fuerte", options: [
        { label: "Opción A", items: [{ name: "Lomo", qty: 50, price: 30000 }] },
        { label: "Opción B", items: [{ name: "Pollo", qty: 50, price: 20000 }] },
      ]},
      { name: "Postres", options: [
        { label: "Opción A", items: [{ name: "Mousse", qty: 50, price: 8000 }] },
      ]},
    ],
  };
  const out = getItemsVendidos(q);
  eq(out.length, 2, "Lomo (Opción A) + Mousse; Pollo (Opción B) excluido");
  eq(out[0].nombre, "Lomo", "primera línea es la Opción A");
  eq(out[0].subtotal, 1500000, "subtotal Lomo = 50*30000");
  eq(out[1].nombre, "Mousse", "segunda línea de la sección con opción única");
});

describe("Caso 3: proposal — sección alternativa (incluirEnTotal:false) se ignora", () => {
  const q = {
    kind: "proposal",
    sections: [
      { name: "Plato Fuerte", options: [{ label: "Opción A", items: [{ name: "Lomo", qty: 10, price: 30000 }] }] },
      { name: "Alternativa premium", incluirEnTotal: false, options: [{ label: "Opción A", items: [{ name: "Langosta", qty: 10, price: 90000 }] }] },
    ],
  };
  const out = getItemsVendidos(q);
  eq(out.length, 1, "solo el plato incluido; la alternativa se ignora");
  eq(out[0].nombre, "Lomo", "no aparece Langosta");
});

describe("Caso 4: proposal con sección de una sola opción sin label 'Opción A'", () => {
  const q = {
    kind: "proposal",
    sections: [{ name: "Bebidas", options: [{ items: [{ name: "Limonada", qty: 30, price: 5000 }] }] }],
  };
  const out = getItemsVendidos(q);
  eq(out.length, 1, "opción única cuenta aunque no tenga label");
  eq(out[0].subtotal, 150000, "subtotal = 30*5000");
});

describe("Caso 5: doc sin items devuelve arreglo vacío", () => {
  eq(getItemsVendidos({ kind: "quote" }), [], "quote sin cart/cust → []");
  eq(getItemsVendidos({ kind: "proposal" }), [], "proposal sin sections → []");
  eq(getItemsVendidos(null), [], "null → []");
});

describe("Caso 6: valores faltantes se normalizan a 0", () => {
  const q = { kind: "quote", cart: [{ n: "Sin precio", qty: 5 }, { n: "Sin qty", p: 1000 }] };
  const out = getItemsVendidos(q);
  eq(out[0], { nombre: "Sin precio", desc: "", unidad: "", qty: 5, precioUnit: 0, subtotal: 0 }, "precio ausente → 0");
  eq(out[1], { nombre: "Sin qty", desc: "", unidad: "", qty: 0, precioUnit: 1000, subtotal: 0 }, "qty ausente → 0");
});

// ─── Resumen ────────────────────────────────────────────────────────────────

console.log("");
if (fail === 0) {
  console.log(`${c.g}${c.b}✅ ${pass} tests pasaron${c.x}`);
  process.exit(0);
} else {
  console.log(`${c.r}${c.b}❌ ${fail} falló(aron) · ${pass} pasaron${c.x}`);
  process.exit(1);
}
